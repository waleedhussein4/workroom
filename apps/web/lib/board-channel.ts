'use client'

import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import type { BoardPresence, PresencePeer } from './use-board-channel'

/**
 * The board room.
 *
 * Carries two things and no document state: awareness (who is looking, who is
 * dragging what) and the mutation events the web server publishes after a
 * write commits. Board data itself lives in Postgres.
 */

interface Connection {
  provider: HocuspocusProvider
  doc: Y.Doc
  refCount: number
}

const connections = new Map<string, Connection>()

const PRESENCE_COLOURS = 8

/** Stable colour per person, so someone keeps theirs between sessions. */
function colourFor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  }
  return `var(--presence-${hash % PRESENCE_COLOURS})`
}

async function fetchTicket(room: string): Promise<string | null> {
  const response = await fetch('/api/realtime/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room }),
  })
  if (!response.ok) return null
  const data = (await response.json()) as { token?: string }
  return data.token ?? null
}

export function connectBoardChannel({
  boardId,
  user,
  onPresence,
  onConnected,
  onEvent,
}: {
  boardId: string
  user: { id: string; name: string }
  onPresence: (presence: BoardPresence) => void
  onConnected: (connected: boolean) => void
  onEvent: () => void
}): () => void {
  const base = process.env.NEXT_PUBLIC_SYNC_URL
  if (!base) return () => {}

  const room = `board:${boardId}`
  let disposed = false
  let connection: Connection | undefined

  void (async () => {
    const token = await fetchTicket(room)
    if (disposed || !token) return

    const existing = connections.get(room)
    if (existing) {
      existing.refCount += 1
      connection = existing
    } else {
      const doc = new Y.Doc()
      const provider = new HocuspocusProvider({
        url: base,
        name: room,
        document: doc,
        token,
        // A board room carries no document. Everything useful arrives as
        // awareness or as a stateless message published by the web server.
      })
      connection = { provider, doc, refCount: 1 }
      connections.set(room, connection)
    }

    const { provider } = connection

    provider.setAwarenessField('user', {
      id: user.id,
      name: user.name,
      color: colourFor(user.id),
      draggingCardId: null,
    })

    const emitPresence = () => {
      const states = provider.awareness?.getStates() ?? new Map()
      const peers: PresencePeer[] = []
      const draggingCardIds: BoardPresence['draggingCardIds'] = {}

      for (const [clientId, state] of states) {
        const info = (state as { user?: PresencePeer }).user
        if (!info || clientId === provider.awareness?.clientID) continue
        peers.push(info)
        if (info.draggingCardId) {
          draggingCardIds[info.draggingCardId] = { name: info.name, color: info.color }
        }
      }
      onPresence({ peers, draggingCardIds })
    }

    const onStatus = ({ status }: { status: string }) => onConnected(status === 'connected')
    const onStateless = () => onEvent()

    provider.on('awarenessUpdate', emitPresence)
    provider.on('status', onStatus)
    provider.on('stateless', onStateless)
    emitPresence()

    if (disposed) {
      provider.off('awarenessUpdate', emitPresence)
      provider.off('status', onStatus)
      provider.off('stateless', onStateless)
    }
  })()

  return () => {
    disposed = true
    onConnected(false)
    if (!connection) return
    connection.refCount -= 1
    if (connection.refCount <= 0) {
      connection.provider.destroy()
      connection.doc.destroy()
      connections.delete(room)
    }
  }
}

/** Publishes the local drag state so other people see the ghost. */
export function setLocalDragging(boardId: string, cardId: string | null): void {
  const connection = connections.get(`board:${boardId}`)
  if (!connection) return
  const current = connection.provider.awareness?.getLocalState() as
    { user?: PresencePeer } | undefined
  if (!current?.user) return
  connection.provider.setAwarenessField('user', { ...current.user, draggingCardId: cardId })
}
