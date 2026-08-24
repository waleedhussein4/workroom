import { jwtVerify } from 'jose'

export interface TicketClaims {
  userId: string
  name: string
  room: string
  canWrite: boolean
}

/**
 * Verifies a room-scoped ticket issued by the web app.
 *
 * Tickets live for a minute. That is long enough to complete a handshake and
 * short enough that one captured from a proxy log or a browser history entry
 * is already useless.
 */
export async function verifyTicket(token: string, secret: string): Promise<TicketClaims> {
  if (!token) throw new Error('No ticket supplied')

  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'],
  })

  const { sub, room, canWrite, name } = payload as {
    sub?: string
    room?: string
    canWrite?: boolean
    name?: string
  }

  if (!sub || typeof room !== 'string') throw new Error('Malformed ticket')

  return {
    userId: sub,
    name: typeof name === 'string' ? name : 'Someone',
    room,
    canWrite: canWrite === true,
  }
}
