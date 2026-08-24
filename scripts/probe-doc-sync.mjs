/**
 * Checks that two clients editing one document converge, and that the text
 * survives a full disconnect.
 *
 * This is the property the CRDT exists for. Both clients insert into the same
 * paragraph at the same time, without coordinating, and both must end up with
 * the same string. A third client connecting afterwards must see it too, which
 * only works if the sync server persisted the state and returned the exact
 * bytes it stored.
 *
 *   node scripts/probe-doc-sync.mjs <documentId>
 */

import { SignJWT } from 'jose'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const documentId = process.argv[2]
if (!documentId) {
  console.error('usage: node scripts/probe-doc-sync.mjs <documentId>')
  process.exit(1)
}

const room = `doc:${documentId}`
const url = process.env.SYNC_URL ?? 'ws://localhost:1234'
const secret = new TextEncoder().encode(
  process.env.REALTIME_JWT_SECRET ?? 'local-development-realtime-secret',
)

const ticket = (userId) =>
  new SignJWT({ room, canWrite: true, name: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('120s')
    .sign(secret)

async function client(userId) {
  const doc = new Y.Doc()
  let settle
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${userId} never synced`)), 10000)
    settle = (error) => {
      clearTimeout(timer)
      if (error) reject(new Error(`${userId}: ${error}`))
      else resolve()
    }
  })

  const provider = new HocuspocusProvider({
    url,
    name: room,
    document: doc,
    token: await ticket(userId),
    onSynced: () => settle(),
    onAuthenticationFailed: ({ reason }) => settle(`auth failed (${reason})`),
  })

  await ready
  return { doc, provider, fragment: doc.getXmlFragment('default') }
}

const settle = (ms = 900) => new Promise((resolve) => setTimeout(resolve, ms))

/** Appends a paragraph, the way the editor would. */
function appendParagraph(fragment, text) {
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  fragment.insert(fragment.length, [paragraph])
}

const alice = await client('probe-alice')
const bob = await client('probe-bob')

// Both write at the same moment without coordinating.
appendParagraph(alice.fragment, 'written by alice')
appendParagraph(bob.fragment, 'written by bob')
await settle()

const aliceText = alice.fragment.toString()
const bobText = bob.fragment.toString()

console.log('alice sees :', aliceText.replace(/<[^>]+>/g, '|'))
console.log('bob sees   :', bobText.replace(/<[^>]+>/g, '|'))
console.log('converged  :', aliceText === bobText ? 'YES' : 'NO')

const bothPresent = aliceText.includes('written by alice') && aliceText.includes('written by bob')
console.log('both edits :', bothPresent ? 'PRESENT' : 'LOST')

// Concurrent insertion into the same paragraph, which is where a
// last-write-wins model would drop one side entirely.
const aliceParagraph = alice.fragment.get(0)
const bobParagraph = bob.fragment.get(0)
if (aliceParagraph instanceof Y.XmlElement && bobParagraph instanceof Y.XmlElement) {
  const aliceInner = aliceParagraph.get(0)
  const bobInner = bobParagraph.get(0)
  if (aliceInner instanceof Y.XmlText && bobInner instanceof Y.XmlText) {
    aliceInner.insert(0, 'AAA ')
    bobInner.insert(0, 'BBB ')
    await settle()
    const merged = alice.fragment.toString()
    console.log(
      'same-para  :',
      merged.includes('AAA') && merged.includes('BBB') ? 'BOTH KEPT' : 'ONE LOST',
    )
    console.log(
      'still same :',
      alice.fragment.toString() === bob.fragment.toString() ? 'YES' : 'NO',
    )
  }
}

const expected = alice.fragment.toString()

// Give the server's debounced write time to land, then disconnect everyone.
await settle(3500)
alice.provider.destroy()
bob.provider.destroy()
alice.doc.destroy()
bob.doc.destroy()
await settle(1500)

// A fresh client must see the persisted document.
const carol = await client('probe-carol')
await settle()
const persisted = carol.fragment.toString()
console.log('persisted  :', persisted === expected ? 'MATCHES' : 'DIFFERS')
if (persisted !== expected) {
  console.log('  expected :', expected)
  console.log('  got      :', persisted)
}

carol.provider.destroy()
carol.doc.destroy()
process.exit(0)
