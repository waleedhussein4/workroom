'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CommentThread } from '@/components/board/comment-thread'
import { LabelChip } from '@/components/board/label-chip'
import { deleteCard, updateCard } from '@/server/actions/board'
import { listCardLabels, setCardLabel } from '@/server/actions/label'
import type { LabelView } from '@/lib/labels'
import type { BoardMember } from '@/components/board/board-view'

interface CardDetail {
  title: string
  description: string
  assigneeId: string
  dueDate: string
}

/** ISO timestamp to the yyyy-mm-dd a date input expects. */
function toDateInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function CardPanel({
  cardId,
  members,
  labels,
  canEdit,
  onClose,
  onChanged,
}: {
  cardId: string
  members: BoardMember[]
  labels: LabelView[]
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<CardDetail | null>(null)
  const [attached, setAttached] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [response, labelResult] = await Promise.all([
        fetch(`/api/cards/${cardId}`),
        listCardLabels(cardId),
      ])
      if (cancelled) return

      if (!response.ok) {
        setError('That card could not be loaded.')
        return
      }
      const data = (await response.json()) as {
        title: string
        description: string | null
        assigneeId: string | null
        dueDate: string | null
      }
      if (cancelled) return

      setDetail({
        title: data.title,
        description: data.description ?? '',
        assigneeId: data.assigneeId ?? '',
        dueDate: toDateInput(data.dueDate),
      })
      if (labelResult.ok) setAttached(new Set(labelResult.data))
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [cardId])

  const toggleLabel = useCallback(
    async (labelId: string) => {
      const next = !attached.has(labelId)
      // Optimistic: the chip should respond to the click, not to the round trip.
      setAttached((current) => {
        const copy = new Set(current)
        if (next) copy.add(labelId)
        else copy.delete(labelId)
        return copy
      })

      const result = await setCardLabel(cardId, labelId, next)
      if (!result.ok) {
        setAttached((current) => {
          const copy = new Set(current)
          if (next) copy.delete(labelId)
          else copy.add(labelId)
          return copy
        })
        toast.error(result.error)
        return
      }
      onChanged()
    },
    [attached, cardId, onChanged],
  )

  async function onSave(formData: FormData) {
    setPending(true)
    const assigneeId = String(formData.get('assigneeId') ?? '')
    const dueDate = String(formData.get('dueDate') ?? '')

    const result = await updateCard(cardId, {
      title: String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? '') || null,
      assigneeId: assigneeId || null,
      // A date input gives a bare yyyy-mm-dd, which Date parses as UTC
      // midnight. Good enough for a due date, which has no time of day.
      dueDate: dueDate || null,
    })
    setPending(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Card</DialogTitle>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-destructive py-4 text-sm">
            {error}
          </p>
        ) : detail === null ? (
          <div className="flex flex-col gap-3 py-4" aria-label="Loading card">
            <div className="bg-muted h-8 animate-pulse rounded-md" />
            <div className="bg-muted h-24 animate-pulse rounded-md" />
            <div className="bg-muted h-8 w-1/2 animate-pulse rounded-md" />
          </div>
        ) : (
          <>
            <form action={onSave} className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-title">Title</Label>
                <Input
                  id="card-title"
                  name="title"
                  defaultValue={detail.title}
                  disabled={!canEdit || pending}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-description">Description</Label>
                <textarea
                  id="card-description"
                  name="description"
                  defaultValue={detail.description}
                  disabled={!canEdit || pending}
                  rows={4}
                  className="border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-ring rounded-md border px-3 py-2 text-sm outline-none"
                  placeholder="What needs doing?"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="card-assignee">Assignee</Label>
                  <select
                    id="card-assignee"
                    name="assigneeId"
                    defaultValue={detail.assigneeId}
                    disabled={!canEdit || pending}
                    className="border-input bg-card text-foreground focus-visible:border-ring h-8 rounded-md border px-2 text-sm outline-none"
                  >
                    <option value="">Nobody</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="card-due">Due date</Label>
                  <Input
                    id="card-due"
                    name="dueDate"
                    type="date"
                    defaultValue={detail.dueDate}
                    disabled={!canEdit || pending}
                  />
                </div>
              </div>

              {labels.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-foreground text-sm font-medium">Labels</span>
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map((item) => {
                      const on = attached.has(item.id)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={!canEdit}
                          aria-pressed={on}
                          onClick={() => void toggleLabel(item.id)}
                          className={on ? '' : 'opacity-40 grayscale'}
                        >
                          <LabelChip name={item.name} color={item.color} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {canEdit ? (
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={async () => {
                      setPending(true)
                      const result = await deleteCard(cardId)
                      setPending(false)
                      if (!result.ok) return toast.error(result.error)
                      onChanged()
                      onClose()
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Delete
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Save
                  </Button>
                </div>
              ) : null}
            </form>

            <div className="border-border mt-2 border-t pt-5">
              <CommentThread cardId={cardId} canComment={canEdit} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
