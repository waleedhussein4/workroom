'use client'

import { MessageSquare } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useCardDrag } from '@/components/board/board-dnd'
import { initialsOf } from '@/components/workspace/user-menu'
import { cn } from '@/lib/utils'
import type { BoardCard, BoardMember } from '@/components/board/board-view'

export function BoardCardTile({
  card,
  index,
  columnId,
  members,
  canEdit,
  isDragging,
  remoteDragger,
  onOpen,
}: {
  card: BoardCard
  index: number
  columnId: string
  members: BoardMember[]
  canEdit: boolean
  isDragging: boolean
  remoteDragger: { name: string; color: string } | null
  onOpen: () => void
}) {
  const { ref, isDragging: dragging } = useCardDrag({
    id: card.id,
    index,
    columnId,
    disabled: !canEdit,
  })

  const assignee = members.find((member) => member.id === card.assigneeId)
  const active = isDragging || dragging

  return (
    <li
      ref={ref}
      data-testid={`card-${card.id}`}
      data-dragging={active ? '' : undefined}
      style={remoteDragger ? { outlineColor: remoteDragger.color } : undefined}
      className={cn(
        'bg-card border-border rounded-lg border shadow-xs',
        'transition-[box-shadow,transform] duration-(--duration-micro)',
        active && 'scale-[1.02] shadow-md',
        // Somebody else has this card picked up. A hint, not a lock.
        remoteDragger && 'outline-2 outline-offset-2',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-foreground text-sm leading-snug">{card.title}</span>

        {remoteDragger ? (
          <span className="text-2xs font-medium" style={{ color: remoteDragger.color }}>
            {remoteDragger.name} is moving this
          </span>
        ) : null}

        {card.commentCount > 0 || assignee ? (
          <span className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              {card.commentCount > 0 ? (
                <>
                  <MessageSquare className="size-3" aria-hidden />
                  <span className="tabular">{card.commentCount}</span>
                </>
              ) : null}
            </span>
            {assignee ? (
              <Avatar className="size-5">
                {assignee.image ? <AvatarImage src={assignee.image} alt="" /> : null}
                <AvatarFallback className="text-[9px]">{initialsOf(assignee.name)}</AvatarFallback>
              </Avatar>
            ) : null}
          </span>
        ) : null}
      </button>
    </li>
  )
}
