/**
 * Checks that the sync server enforces its ticket rules.
 *
 * The property that matters is the second case: a perfectly valid ticket for
 * one room must not open a different one. Without that check a member of any
 * workspace could reach any document, because the ticket itself is the only
 * thing the sync server sees.
 *
 * Needs the sync server running:
 *
 *   npm run dev --workspace @workroom/sync
 *   node scripts/probe-realtime-auth.mjs
 *
 * Expected output:
 *   matching room       : AUTHENTICATED
 *   mismatched room     : REJECTED
 *   garbage ticket      : REJECTED
 *   expired ticket      : REJECTED
 *   forged signature    : REJECTED
 */

import { SignJWT } from 'jose'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const secret = new TextEncoder().encode(
  process.env.REALTIME_JWT_SECRET ?? 'local-development-realtime-secret',
)
const url = process.env.SYNC_URL ?? 'ws://localhost:1234'

async function ticket(room, canWrite = true) {
  return new SignJWT({ room, canWrite, name: 'Probe' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('user-probe')
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(secret)
}

function attempt(room, token, label) {
  return new Promise((resolve) => {
    const doc = new Y.Doc()
    let settled = false
    const finish = (outcome) => {
      if (settled) return
      settled = true
      try {
        provider.destroy()
      } catch {
        // Already torn down by a failed handshake.
      }
      doc.destroy()
      resolve(`${label}: ${outcome}`)
    }
    const provider = new HocuspocusProvider({
      url,
      name: room,
      document: doc,
      token,
      onAuthenticated: () => finish('AUTHENTICATED'),
      onAuthenticationFailed: ({ reason }) => finish(`REJECTED (${reason})`),
      onClose: () => finish('CLOSED'),
    })
    setTimeout(() => finish('TIMEOUT'), 6000)
  })
}

const good = await ticket('board:alpha')
console.log(await attempt('board:alpha', good, 'matching room       '))
console.log(await attempt('board:beta', good, 'mismatched room     '))
console.log(await attempt('board:alpha', 'not-a-jwt', 'garbage ticket      '))

const expired = await new SignJWT({ room: 'board:alpha', canWrite: true })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject('user-probe')
  .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
  .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
  .sign(secret)
console.log(await attempt('board:alpha', expired, 'expired ticket      '))

const wrongSecret = await new SignJWT({ room: 'board:alpha', canWrite: true })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject('user-probe')
  .setIssuedAt()
  .setExpirationTime('60s')
  .sign(new TextEncoder().encode('a-different-secret-entirely-here'))
console.log(await attempt('board:alpha', wrongSecret, 'forged signature    '))

process.exit(0)
