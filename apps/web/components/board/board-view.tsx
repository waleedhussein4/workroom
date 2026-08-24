'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { sortByPosition, keyBetween, type OrderKey } from '@workroom/core'
import { BoardDnd, type CardMove } from '@/components/board/board-dnd'
import { BoardColumn } from '@/components/board/board-column'
import { CardPanel } from '@/components/board/card-panel'
import { Button } from '@/components/ui/button'
import { moveCard } from '@/server/actions/board'
import type { LabelView } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useBoardChannel } from '@/lib/use-board-channel'

export interface BoardCard {
  id: string
  columnId: string
  title: string
  description: string | null
  assigneeId: string | null
  dueDate: string | null
  position: string
  commentCount: number
}

export interface BoardColumnData {
  id: string
  name: string
  position: string
}

export interface BoardMember {
  id: string
  name: string
  image: string | null
}

interface BoardViewProps {
  boardId: string
  columns: BoardColumnData[]
  cards: BoardCard[]
  members: BoardMember[]
  labels: LabelView[]
  canEdit: boolean
  currentUser: { id: string; name: string }
}

/** Card ids per column, in display order. */
function toLayout(columns: BoardColumnData[], cards: BoardCard[]): Record<string, string[]> {
  const layout: Record<string, string[]> = {}
  for (const column of columns) layout[column.id] = []
  for (const card of sortByPosition(
    cards.map((c) => ({ ...c, position: c.position as OrderKey })),
  )) {
    ;(layout[card.columnId] ??= []).push(card.id)
  }
  return layout
}

export function BoardView({
  boardId,
  columns,
  cards: initialCards,
  members,
  labels,
  canEdit,
  currentUser,
}: BoardViewProps) {
  const router = useRouter()
  const [cards, setCards] = useState(initialCards)
  const [layout, setLayout] = useState(() => toLayout(columns, initialCards))
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  /**
   * Adopt fresh server data when it arrives.
   *
   * The board keeps cards in state so a drag can be applied optimistically,
   * but that means a `router.refresh()` would otherwise re-render the server
   * component and change nothing on screen. Adjusting state during render is
   * React's documented way to reset on a prop change, and unlike an effect it
   * does not paint the stale value first.
   */
  const [lastServerCards, setLastServerCards] = useState(initialCards)
  if (lastServerCards !== initialCards) {
    setLastServerCards(initialCards)
    setCards(initialCards)
    setLayout(toLayout(columns, initialCards))
  }

  // While a drag is in flight, remote order changes for the affected board are
  // held rather than applied. Applying them mid-drag yanks the card out from
  // under the pointer. Everything else still lands immediately.
  const dragging = useRef(false)
  const buffered = useRef(false)

  const refresh = useCallback(() => {
    if (dragging.current) {
      buffered.current = true
      return
    }
    router.refresh()
  }, [router])

  const { presence, connected } = useBoardChannel({
    boardId,
    user: currentUser,
    draggingCardId: draggingId,
    onEvent: refresh,
  })

  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])

  async function onCardMoved(move: CardMove) {
    if (!canEdit) return

    const previousCards = cards
    const previousLayout = layout

    // Optimistic key so the card settles immediately. The server generates the
    // authoritative one; this is replaced when it answers.
    const before = move.beforeId ? cardsById.get(move.beforeId)?.position : null
    const after = move.afterId ? cardsById.get(move.afterId)?.position : null
    const optimistic = safeKeyBetween(before ?? null, after ?? null)

    setCards((current) =>
      current.map((card) =>
        card.id === move.cardId
          ? { ...card, columnId: move.toColumnId, position: optimistic }
          : card,
      ),
    )

    const result = await moveCard(move)

    if (!result.ok) {
      setCards(previousCards)
      setLayout(previousLayout)
      toast.error(result.error)
      return
    }

    setCards((current) =>
      current.map((card) =>
        card.id === move.cardId
          ? { ...card, columnId: result.data.columnId, position: result.data.position }
          : card,
      ),
    )

    if (buffered.current) {
      buffered.current = false
      router.refresh()
    }
  }

  const cardsFor = useCallback(
    (columnId: string) =>
      (layout[columnId] ?? [])
        .map((id) => cardsById.get(id))
        .filter((card): card is BoardCard => card !== undefined),
    [layout, cardsById],
  )

  return (
    <>
      <BoardPresenceBar connected={connected} peers={presence.peers} />

      <BoardDnd
        layout={layout}
        onLayoutChange={setLayout}
        onCardMoved={onCardMoved}
        disabled={!canEdit}
        onDragStateChange={(id) => {
          dragging.current = id !== null
          setDraggingId(id)
          if (id === null && buffered.current) {
            buffered.current = false
            router.refresh()
          }
        }}
      >
        <div className="flex h-full items-start gap-3 overflow-x-auto px-6 pb-6">
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              cards={cardsFor(column.id)}
              members={members}
              canEdit={canEdit}
              draggingCardId={draggingId}
              remoteDragging={presence.draggingCardIds}
              onOpenCard={setOpenCardId}
            />
          ))}

          {canEdit ? <AddColumn boardId={boardId} /> : null}
        </div>
      </BoardDnd>

      {openCardId ? (
        <CardPanel
          cardId={openCardId}
          members={members}
          labels={labels}
          canEdit={canEdit}
          onClose={() => setOpenCardId(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}
    </>
  )
}

/**
 * Who else is looking, and whether this board is receiving live updates.
 *
 * The `data-connected` attribute is not decoration: it is the only honest
 * signal that this client has joined the board room, and the end-to-end tests
 * wait on it before acting. Without it a test can act before the other window
 * has subscribed and then fail for a reason that has nothing to do with the
 * behaviour under test.
 */
function BoardPresenceBar({
  connected,
  peers,
}: {
  connected: boolean
  peers: { id: string; name: string; color: string }[]
}) {
  return (
    <div
      className="flex h-8 items-center gap-3 px-6"
      data-testid="board-presence"
      data-connected={connected ? 'true' : 'false'}
      data-peers={peers.length}
    >
      <span
        className="text-muted-foreground flex items-center gap-1.5 text-xs"
        title={connected ? 'Receiving live updates' : 'Not connected to the sync server'}
      >
        <span
          aria-hidden
          className={cn(
            'size-1.5 rounded-full transition-colors duration-(--duration-base)',
            connected ? 'bg-success' : 'bg-muted-foreground/50',
          )}
        />
        {connected ? 'Live' : 'Offline'}
      </span>

      {peers.length > 0 ? (
        <span className="flex items-center -space-x-1.5">
          {peers.slice(0, 5).map((peer) => (
            <span
              key={peer.id}
              title={peer.name}
              style={{ backgroundColor: peer.color }}
              className="border-background text-2xs flex size-5 items-center justify-center rounded-full border-2 font-medium text-white"
            >
              {peer.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  )
}

/** Never throws: a stale neighbour must not break a drop. */
function safeKeyBetween(before: string | null, after: string | null): string {
  try {
    if (before !== null && after !== null && before >= after) {
      return keyBetween(before as OrderKey, null)
    }
    return keyBetween(before as OrderKey | null, after as OrderKey | null)
  } catch {
    return keyBetween(null, null)
  }
}

function AddColumn({ boardId }: { boardId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <Button
      variant="ghost"
      className="text-muted-foreground hover:text-foreground h-9 w-56 shrink-0 justify-start"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        const { createColumn } = await import('@/server/actions/board')
        const data = new FormData()
        data.set('name', 'New column')
        const result = await createColumn(boardId, data)
        setPending(false)
        if (!result.ok) toast.error(result.error)
        else router.refresh()
      }}
    >
      <Plus className="size-4" aria-hidden />
      Add column
    </Button>
  )
}
