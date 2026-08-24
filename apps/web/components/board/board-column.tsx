'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { BoardCardTile } from '@/components/board/board-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createCard } from '@/server/actions/board'
import { ColumnMenu } from '@/components/board/column-menu'
import type { ColumnNeighbours } from '@/components/board/board-view'
import type { BoardCard, BoardColumnData, BoardMember } from '@/components/board/board-view'

export function BoardColumn({
  column,
  cards,
  members,
  canEdit,
  draggingCardId,
  remoteDragging,
  neighbours,
  onOpenCard,
}: {
  column: BoardColumnData
  cards: BoardCard[]
  members: BoardMember[]
  canEdit: boolean
  draggingCardId: string | null
  remoteDragging: Record<string, { name: string; color: string }>
  neighbours: ColumnNeighbours
  onOpenCard: (cardId: string) => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [pending, setPending] = useState(false)

  async function onAdd(formData: FormData) {
    const title = String(formData.get('title') ?? '').trim()
    if (title.length === 0) {
      setAdding(false)
      return
    }
    setPending(true)
    const result = await createCard(column.id, formData)
    setPending(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setAdding(false)
    router.refresh()
  }

  return (
    <section
      className="bg-muted/40 flex w-72 shrink-0 flex-col rounded-xl"
      aria-label={column.name}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        {canEdit ? (
          <ColumnMenu
            columnId={column.id}
            name={column.name}
            cardCount={cards.length}
            canMoveLeft={neighbours.canMoveLeft}
            canMoveRight={neighbours.canMoveRight}
            neighbours={neighbours.targets}
          />
        ) : (
          <h2 className="text-foreground truncate text-sm font-medium">
            {column.name}
            <span className="text-muted-foreground tabular ml-2 text-xs">{cards.length}</span>
          </h2>
        )}
      </header>

      <ul
        className="flex min-h-2 flex-col gap-2 px-3 pb-2"
        data-testid="column-cards"
        data-column-id={column.id}
      >
        {cards.map((card, index) => (
          <BoardCardTile
            key={card.id}
            card={card}
            index={index}
            columnId={column.id}
            members={members}
            canEdit={canEdit}
            isDragging={draggingCardId === card.id}
            remoteDragger={remoteDragging[card.id] ?? null}
            onOpen={() => onOpenCard(card.id)}
          />
        ))}

        {cards.length === 0 && !adding ? (
          <li className="text-muted-foreground px-1 py-6 text-center text-xs">Nothing here yet</li>
        ) : null}
      </ul>

      {canEdit ? (
        <div className="px-3 pb-3">
          {adding ? (
            <form action={onAdd}>
              <Input
                name="title"
                autoFocus
                disabled={pending}
                placeholder="Card title"
                className="bg-card"
                onBlur={(event) => {
                  if (event.currentTarget.value.trim() === '') setAdding(false)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setAdding(false)
                }}
              />
            </form>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground w-full justify-start"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-3.5" aria-hidden />
              Add card
            </Button>
          )}
        </div>
      ) : null}
    </section>
  )
}
