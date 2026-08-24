'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteCard, updateCard } from '@/server/actions/board'
import type { BoardMember } from '@/components/board/board-view'

export function CardPanel({
  cardId,
  canEdit,
  onClose,
  onChanged,
}: {
  cardId: string
  members: BoardMember[]
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<{ title: string; description: string } | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/cards/${cardId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { title: string; description: string | null } | null) => {
        if (cancelled || !data) return
        setDetail({ title: data.title, description: data.description ?? '' })
      })
    return () => {
      cancelled = true
    }
  }, [cardId])

  async function onSave(formData: FormData) {
    setPending(true)
    const result = await updateCard(cardId, {
      title: String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? '') || null,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Card</DialogTitle>
        </DialogHeader>

        {detail === null ? (
          <div className="flex flex-col gap-3 py-4">
            <div className="bg-muted h-8 animate-pulse rounded-md" />
            <div className="bg-muted h-24 animate-pulse rounded-md" />
          </div>
        ) : (
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
                rows={5}
                className="border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-ring rounded-md border px-3 py-2 text-sm outline-none"
                placeholder="What needs doing?"
              />
            </div>

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
        )}
      </DialogContent>
    </Dialog>
  )
}
