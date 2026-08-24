'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteColumn, moveColumn, renameColumn } from '@/server/actions/board'

/**
 * Column controls: rename in place, reorder, delete.
 *
 * Reordering is a menu action rather than a drag. Columns are dragged rarely,
 * and adding a second drag context inside the card one is a lot of complexity
 * and a lot of new ways for a pointer gesture to be claimed by the wrong
 * target. The server action underneath is the same fractional index logic the
 * cards use, so a menu today does not preclude a drag later.
 */
export function ColumnMenu({
  columnId,
  name,
  cardCount,
  canMoveLeft,
  canMoveRight,
  neighbours,
}: {
  columnId: string
  name: string
  cardCount: number
  canMoveLeft: boolean
  canMoveRight: boolean
  /**
   * Ids the column would sit between after each move, worked out by the board
   * because only it knows the full order.
   */
  neighbours: {
    left: { beforeId: string | null; afterId: string | null }
    right: { beforeId: string | null; afterId: string | null }
  }
}) {
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onRename(formData: FormData) {
    const next = String(formData.get('name') ?? '').trim()
    setRenaming(false)
    if (next.length === 0 || next === name) return

    setBusy(true)
    const result = await renameColumn(columnId, formData)
    setBusy(false)

    // A form action must resolve to void, so the toast cannot be returned.
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    router.refresh()
  }

  async function move(direction: 'left' | 'right') {
    const { beforeId, afterId } = neighbours[direction]
    setBusy(true)
    const result = await moveColumn(columnId, beforeId, afterId)
    setBusy(false)
    if (!result.ok) return toast.error(result.error)
    router.refresh()
  }

  if (renaming) {
    return (
      <form action={onRename} className="flex-1">
        <input
          ref={inputRef}
          name="name"
          defaultValue={name}
          autoFocus
          disabled={busy}
          aria-label="Column name"
          onBlur={(event) => event.currentTarget.form?.requestSubmit()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setRenaming(false)
          }}
          className="border-input bg-card text-foreground focus-visible:border-ring w-full rounded-md border px-1.5 py-0.5 text-sm outline-none"
        />
      </form>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-between gap-2">
      <h2 className="text-foreground truncate text-sm font-medium">
        {name}
        <span className="text-muted-foreground tabular ml-2 text-xs">{cardCount}</span>
      </h2>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={busy}
              aria-label={`Options for ${name}`}
            >
              <MoreHorizontal className="size-3.5" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <Pencil className="size-3.5" aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveLeft} onClick={() => void move('left')}>
            <ChevronLeft className="size-3.5" aria-hidden />
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveRight} onClick={() => void move('right')}>
            <ChevronRight className="size-3.5" aria-hidden />
            Move right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={async () => {
              // Deleting a column takes its cards with it, so an empty one
              // goes without ceremony and a full one asks first.
              if (cardCount > 0) {
                const ok = window.confirm(
                  `Delete "${name}" and its ${cardCount} ${cardCount === 1 ? 'card' : 'cards'}?`,
                )
                if (!ok) return
              }
              setBusy(true)
              const result = await deleteColumn(columnId)
              setBusy(false)
              if (!result.ok) return toast.error(result.error)
              router.refresh()
            }}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
