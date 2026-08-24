import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { can } from '@workroom/core'
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  requireBoard,
  requireDocument,
} from '@/server/guard'
import { optional } from '@/server/env'

/**
 * Mints a short-lived, room-scoped ticket for the WebSocket connection.
 *
 * Browsers cannot set headers on `new WebSocket()`, so the session is traded
 * for a signed token carried as a query parameter. The token names exactly one
 * room, and the sync server refuses to open any other with it. Sixty seconds
 * is plenty to complete a handshake and short enough that a leaked URL in a
 * log is not useful.
 */

const TICKET_TTL_SECONDS = 60

export async function POST(request: Request) {
  const secret = optional('REALTIME_JWT_SECRET')
  if (!secret) {
    return NextResponse.json({ error: 'Realtime is not configured' }, { status: 503 })
  }

  let room: string
  try {
    const body = (await request.json()) as { room?: unknown }
    if (typeof body.room !== 'string') throw new Error('bad room')
    room = body.room
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const separator = room.indexOf(':')
  const kind = room.slice(0, separator)
  const id = room.slice(separator + 1)
  if (!id || (kind !== 'board' && kind !== 'doc')) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  try {
    const context =
      kind === 'board'
        ? await requireBoard(id, 'board:read')
        : await requireDocument(id, 'doc:read')

    const canWrite = can(context.role, kind === 'board' ? 'card:update' : 'doc:update')

    const token = await new SignJWT({ room, canWrite, name: context.user.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(context.user.id)
      .setIssuedAt()
      .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
      .sign(new TextEncoder().encode(secret))

    return NextResponse.json({ token, expiresIn: TICKET_TTL_SECONDS })
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw error
  }
}
