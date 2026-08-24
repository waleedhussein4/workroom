'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Send, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { StateView } from '@/components/state-view'
import { initialsOf } from '@/components/workspace/user-menu'
import {
  createComment,
  deleteComment,
  listComments,
  type CommentView,
} from '@/server/actions/comment'

export function CommentThread({ cardId, canComment }: { cardId: string; canComment: boolean }) {
  const [comments, setComments] = useState<CommentView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    const result = await listComments(cardId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setComments(result.data)
  }, [cardId])

  useEffect(() => {
    void load()
  }, [load])

  async function onPost(formData: FormData) {
    const body = String(formData.get('body') ?? '')
    if (body.trim().length === 0) return

    setPending(true)
    const result = await createComment(cardId, body)
    setPending(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    await load()
  }

  if (error) {
    return (
      <StateView
        compact
        title="Could not load comments"
        description={error}
        action={
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-foreground text-sm font-medium">
        Comments
        {comments ? (
          <span className="text-muted-foreground tabular ml-2">{comments.length}</span>
        ) : null}
      </h3>

      {comments === null ? (
        <div className="flex flex-col gap-3" aria-label="Loading comments">
          <div className="bg-muted h-10 animate-pulse rounded-md" />
          <div className="bg-muted h-10 w-4/5 animate-pulse rounded-md" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((item) => (
            <li key={item.id} className="flex gap-2.5">
              <Avatar className="mt-0.5 size-6 shrink-0">
                {item.author.image ? <AvatarImage src={item.author.image} alt="" /> : null}
                <AvatarFallback className="text-[9px]">
                  {initialsOf(item.author.name)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-foreground text-xs font-medium">{item.author.name}</span>
                  <time className="text-muted-foreground text-2xs" dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                  {item.mine ? (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      className="text-muted-foreground hover:text-destructive ml-auto"
                      onClick={async () => {
                        const result = await deleteComment(item.id)
                        if (!result.ok) return toast.error(result.error)
                        await load()
                      }}
                    >
                      <Trash2 className="size-3" aria-hidden />
                    </button>
                  ) : null}
                </div>
                <p className="text-foreground mt-0.5 text-sm break-words whitespace-pre-wrap">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <form action={onPost} className="flex items-end gap-2">
          <textarea
            name="body"
            rows={2}
            maxLength={4000}
            placeholder="Add a comment"
            disabled={pending}
            className="border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-ring flex-1 resize-none rounded-md border px-3 py-2 text-sm outline-none"
            onKeyDown={(event) => {
              // Enter posts, Shift+Enter adds a line, which is what people
              // expect from a comment box rather than a document.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
          />
          <Button type="submit" size="icon" disabled={pending} aria-label="Post comment">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
          </Button>
        </form>
      ) : null}
    </div>
  )
}
