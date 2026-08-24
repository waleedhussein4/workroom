import 'server-only'
import { optional } from './env'

/**
 * Board events pushed to everyone watching.
 *
 * Published by the server rather than the client that made the change,
 * because only the server knows a write actually committed and passed
 * authorization. A client-sent event could announce a mutation that never
 * happened, or one it was not allowed to make.
 *
 * These carry enough for a receiver to patch its local state without a
 * refetch. They are a hint, not a source of truth: a client that misses one
 * (a dropped socket, a restart) refetches the board on reconnect.
 */
export type BoardEvent =
  | { type: 'board.changed'; boardId: string }
  | { type: 'board.renamed'; boardId: string; name: string }
  | { type: 'card.created'; boardId: string; cardId: string }
  | { type: 'card.updated'; boardId: string; cardId: string }
  | { type: 'card.deleted'; boardId: string; cardId: string }
  | {
      type: 'card.moved'
      boardId: string
      cardId: string
      columnId: string
      position: string
      fromColumnId: string
    }
  | { type: 'comment.created'; boardId: string; cardId: string; commentId: string }
  | { type: 'comment.deleted'; boardId: string; cardId: string; commentId: string }

/**
 * Sends an event to the sync server, which fans it out to the board room.
 *
 * Failures are logged and swallowed. The database write has already
 * committed, so throwing here would report a successful change as failed and
 * push the user into retrying something that already happened. Clients that
 * miss the event still converge on their next refetch.
 */
export async function publish(boardId: string, event: BoardEvent): Promise<void> {
  const url = optional('SYNC_INTERNAL_URL')
  const secret = optional('SYNC_INTERNAL_SECRET')
  if (!url || !secret) return

  try {
    const response = await fetch(`${url}/internal/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ room: `board:${boardId}`, event }),
      // The write is already durable; do not hold the response on a slow
      // sync server.
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) {
      console.warn(`Publish to sync server failed with ${response.status}`)
    }
  } catch (error) {
    console.warn('Publish to sync server failed', error)
  }
}
