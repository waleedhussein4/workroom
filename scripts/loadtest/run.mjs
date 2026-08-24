/**
 * Concurrent editing load harness.
 *
 * Drives N headless Yjs clients against one document and measures how long an
 * edit takes to reach every other client, then checks they all ended up with
 * the same document.
 *
 * The convergence check is the point. A latency number on its own says
 * nothing useful, because a server that drops half the updates is extremely
 * fast. Every run therefore ends by comparing document contents across all N
 * clients, and reports failure if any pair disagrees.
 *
 *   node scripts/loadtest/run.mjs --doc <documentId> [--clients 20] [--seconds 30]
 *
 * Needs the sync server running and REALTIME_JWT_SECRET to match it.
 */

import { SignJWT } from 'jose'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
}

const documentId = args.get('doc')
if (!documentId) {
  console.error(
    'usage: node scripts/loadtest/run.mjs --doc <documentId> [--clients N] [--seconds N]',
  )
  process.exit(1)
}

const CLIENTS = Number(args.get('clients') ?? 20)
const SECONDS = Number(args.get('seconds') ?? 30)
const EDITS_PER_SECOND = Number(args.get('rate') ?? 1)

const room = `doc:${documentId}`
const url = process.env.SYNC_URL ?? 'ws://localhost:1234'
const httpUrl = url.replace(/^ws/, 'http')
const secret = new TextEncoder().encode(
  process.env.REALTIME_JWT_SECRET ?? 'local-development-realtime-secret',
)

const ticket = (id) =>
  new SignJWT({ room, canWrite: true, name: id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime('3600s')
    .sign(secret)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function health() {
  try {
    const response = await fetch(`${httpUrl}/health`)
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Latency is measured from the marker being written to it being observed.
 *
 * Every client writes markers of the form `c<client>:<sequence>@<timestamp>`
 * into a shared map, and every other client records the delay when it sees
 * one. Both ends run in this process, so the two clocks are the same clock and
 * the number is a true end-to-end figure rather than a server-side proxy for
 * one.
 */
async function connect(index) {
  const id = `load-${index}`
  const doc = new Y.Doc()
  const latencies = []

  const provider = new HocuspocusProvider({
    url,
    name: room,
    document: doc,
    token: await ticket(id),
  })

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${id} never synced`)), 30_000)
    provider.on('synced', () => {
      clearTimeout(timer)
      resolve()
    })
    provider.on('authenticationFailed', ({ reason }) => {
      clearTimeout(timer)
      reject(new Error(`${id} rejected: ${reason}`))
    })
  })

  const markers = doc.getMap('loadtest')
  markers.observe((event) => {
    const now = Date.now()
    for (const key of event.keysChanged) {
      if (key === id) continue
      const value = markers.get(key)
      if (typeof value !== 'string') continue
      const sentAt = Number(value.split('@')[1])
      if (Number.isFinite(sentAt)) latencies.push(now - sentAt)
    }
  })

  return { id, doc, provider, markers, latencies }
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[index]
}

console.log(`connecting ${CLIENTS} clients to ${room} at ${url}`)

const before = await health()
const clients = []
for (let i = 0; i < CLIENTS; i++) {
  clients.push(await connect(i))
}
console.log(`connected. running for ${SECONDS}s at ${EDITS_PER_SECOND} edit/s each`)

let sequence = 0
const interval = setInterval(() => {
  sequence += 1
  for (const client of clients) {
    client.markers.set(client.id, `${sequence}@${Date.now()}`)
  }
}, 1000 / EDITS_PER_SECOND)

await sleep(SECONDS * 1000)
clearInterval(interval)

// Let the last round finish arriving before measuring convergence.
await sleep(2000)

const all = clients.flatMap((client) => client.latencies)
const during = await health()

// Convergence is checked on content, not on state vectors.
//
// Comparing encoded updates sounds tighter but is not: every client has its
// own client id and its own amount of local history, so two fully converged
// peers still produce non-empty deltas of structural framing. What actually
// matters is whether they agree about the document, so that is what is
// compared.
const contents = clients.map((client) => JSON.stringify(client.markers.toJSON()))
const reference = contents[0]
let converged = true
for (let i = 1; i < contents.length; i++) {
  if (contents[i] !== reference) {
    converged = false
    const mine = JSON.parse(contents[i])
    const theirs = JSON.parse(reference)
    const missing = Object.keys(theirs).filter((k) => mine[k] !== theirs[k])
    console.error(`  ${clients[i].id} disagrees on ${missing.length} entries`)
  }
}

const sample = clients[0].markers.toJSON()
const distinctWriters = Object.keys(sample).length

console.log('')
console.log('observations   :', all.length)
console.log('p50            :', percentile(all, 50), 'ms')
console.log('p95            :', percentile(all, 95), 'ms')
console.log('p99            :', percentile(all, 99), 'ms')
console.log('max            :', all.length ? Math.max(...all) : 0, 'ms')
console.log('writers seen   :', distinctWriters, 'of', CLIENTS)
console.log('converged      :', converged ? 'YES' : 'NO')
if (before && during) {
  console.log('server rss     :', `${before.rssMb}MB -> ${during.rssMb}MB`)
  console.log('documents      :', during.documents)
}

for (const client of clients) {
  client.provider.destroy()
  client.doc.destroy()
}

// Give the server a moment to unload the document, then look at whether the
// memory came back. It staying high is the classic Yjs server leak.
await sleep(5000)
const after = await health()
if (after) {
  console.log('after           :', `rss ${after.rssMb}MB, ${after.documents} documents open`)
}

const failed = !converged || distinctWriters !== CLIENTS
console.log('')
console.log(failed ? 'FAIL' : 'PASS')
process.exit(failed ? 1 : 0)
