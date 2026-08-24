'use client'

import { useEffect, useState } from 'react'

export interface PresencePeer {
  id: string
  name: string
  color: string
  draggingCardId: string | null
}

export interface BoardPresence {
  peers: PresencePeer[]
  /** Card id to the person currently dragging it, for the ghost outline. */
  draggingCardIds: Record<string, { name: string; color: string }>
}

const EMPTY: BoardPresence = { peers: [], draggingCardIds: {} }

/**
 * Live board channel.
 *
 * Connects to the sync server's `board:<id>` room for presence and for the
 * mutation events the web server publishes after a write commits. Until the
 * sync server is configured this stays inert and the board falls back to
 * ordinary navigation, which is why `NEXT_PUBLIC_SYNC_URL` is optional.
 */
export function useBoardChannel({
  boardId,
  user,
  draggingCardId,
  onEvent,
}: {
  boardId: string
  user: { id: string; name: string }
  draggingCardId: string | null
  onEvent: () => void
}): { presence: BoardPresence; connected: boolean } {
  const [presence, setPresence] = useState<BoardPresence>(EMPTY)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SYNC_URL
    if (!base) return

    let cancelled = false
    let cleanup: (() => void) | undefined

    // Imported lazily so the Yjs client is not in the bundle for anyone who
    // never opens a board.
    void import('@/lib/board-channel').then(({ connectBoardChannel }) => {
      if (cancelled) return
      cleanup = connectBoardChannel({
        boardId,
        user,
        onPresence: setPresence,
        onConnected: setConnected,
        onEvent,
      })
    })

    return () => {
      cancelled = true
      cleanup?.()
      setConnected(false)
      setPresence(EMPTY)
    }
    // `onEvent` is intentionally excluded: it is recreated every render and
    // would tear the socket down on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, user.id])

  useEffect(() => {
    if (!connected) return
    void import('@/lib/board-channel').then(({ setLocalDragging }) => {
      setLocalDragging(boardId, draggingCardId)
    })
  }, [boardId, draggingCardId, connected])

  return { presence, connected }
}
