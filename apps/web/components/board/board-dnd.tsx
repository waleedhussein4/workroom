'use client'

import { useRef, type ReactNode } from 'react'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { PointerSensor, KeyboardSensor } from '@dnd-kit/dom'

/**
 * The only file that imports dnd-kit.
 *
 * Everything above this boundary speaks in terms of cards, columns and
 * neighbour ids. Nothing else in the application knows which drag library is
 * in use, which matters because @dnd-kit/react is pre-1.0 and publishes under
 * a beta dist-tag: it is pinned to an exact version, and if it has to be
 * swapped, this is the file that changes.
 *
 * It also means the ordering logic and its tests never touch a React
 * component, let alone a drag library.
 */

export interface CardMove {
  cardId: string
  toColumnId: string
  /** Card that ends up immediately above, or null at the top of a column. */
  beforeId: string | null
  /** Card that ends up immediately below, or null at the bottom. */
  afterId: string | null
}

interface BoardDndProps {
  children: ReactNode
  /** Current card ids per column, in display order. */
  layout: Record<string, string[]>
  onLayoutChange: (next: Record<string, string[]>) => void
  onCardMoved: (move: CardMove) => void
  onDragStateChange?: (draggingCardId: string | null) => void
  disabled?: boolean
}

export function BoardDnd({
  children,
  layout,
  onLayoutChange,
  onCardMoved,
  onDragStateChange,
  disabled = false,
}: BoardDndProps) {
  // The layout as it was when the drag began, so a cancelled drag can be put
  // back exactly rather than approximately.
  const snapshot = useRef<Record<string, string[]> | null>(null)

  return (
    <DragDropProvider
      sensors={[PointerSensor, KeyboardSensor]}
      onDragStart={(event) => {
        if (disabled) return
        snapshot.current = structuredClone(layout)
        onDragStateChange?.(String(event.operation.source?.id ?? '') || null)
      }}
      onDragOver={(event) => {
        if (disabled) {
          event.preventDefault()
          return
        }
        // dnd-kit reorders the DOM directly during a drag, so this only keeps
        // React's copy of the layout in step for the drop calculation.
        const next = applyPreview(layout, event)
        if (next) onLayoutChange(next)
      }}
      onDragEnd={(event) => {
        onDragStateChange?.(null)

        if (event.canceled) {
          if (snapshot.current) onLayoutChange(snapshot.current)
          snapshot.current = null
          return
        }

        const cardId = String(event.operation.source?.id ?? '')
        if (!cardId) return

        const columnId = findColumn(layout, cardId)
        if (!columnId) return

        const ids = layout[columnId] ?? []
        const index = ids.indexOf(cardId)
        snapshot.current = null

        onCardMoved({
          cardId,
          toColumnId: columnId,
          beforeId: index > 0 ? (ids[index - 1] ?? null) : null,
          afterId: index < ids.length - 1 ? (ids[index + 1] ?? null) : null,
        })
      }}
    >
      {children}
    </DragDropProvider>
  )
}

function findColumn(layout: Record<string, string[]>, cardId: string): string | null {
  for (const [columnId, ids] of Object.entries(layout)) {
    if (ids.includes(cardId)) return columnId
  }
  return null
}

/**
 * Computes the layout that the drag is previewing.
 *
 * During a drag, `source` and `target` can be the same element, so the moved
 * card is identified by its live `group` and `index` rather than by comparing
 * the two.
 */
function applyPreview(
  layout: Record<string, string[]>,
  event: { operation: { source: unknown } },
): Record<string, string[]> | null {
  const source = event.operation.source as
    { id?: string | number; sortable?: { group?: string; index?: number } } | null | undefined

  const cardId = source?.id === undefined ? null : String(source.id)
  const group = source?.sortable?.group
  const index = source?.sortable?.index

  if (!cardId || typeof group !== 'string' || typeof index !== 'number') return null

  const from = findColumn(layout, cardId)
  if (from === null) return null
  if (from === group && (layout[group] ?? []).indexOf(cardId) === index) return null

  const next: Record<string, string[]> = {}
  for (const [columnId, ids] of Object.entries(layout)) {
    next[columnId] = ids.filter((id) => id !== cardId)
  }
  const destination = next[group] ?? []
  destination.splice(Math.max(0, Math.min(index, destination.length)), 0, cardId)
  next[group] = destination
  return next
}

/**
 * Makes one card draggable.
 *
 * Exposed from here so card components never import the drag library.
 */
export function useCardDrag({
  id,
  index,
  columnId,
  disabled,
}: {
  id: string
  index: number
  columnId: string
  disabled?: boolean
}) {
  const { ref, isDragging } = useSortable({
    id,
    index,
    group: columnId,
    type: 'card',
    accept: ['card'],
    disabled: disabled ?? false,
  })

  return { ref, isDragging }
}
