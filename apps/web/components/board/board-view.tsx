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
  canEdit,
  currentUser,
}: BoardViewProps) {
  const router = useRouter()
  const [cards, setCards] = useState(initialCards)
  const [layout, setLayout] = useState(() => toLayout(columns, initialCards))
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

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

  const { presence } = useBoardChannel({
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
          canEdit={canEdit}
          onClose={() => setOpenCardId(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}
    </>
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
