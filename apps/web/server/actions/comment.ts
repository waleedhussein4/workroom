'use server'

import { asc, eq } from 'drizzle-orm'
import { canModifyComment } from '@workroom/core'
import { comment, getDb, user } from '@workroom/db'
import { NotFoundError, requireCard, requireComment } from '@/server/guard'
import { publish } from '@/server/publish'
import { actionResult, type ActionResult } from './result'

const MAX_BODY = 4000

export interface CommentView {
  id: string
  body: string
  createdAt: string
  updatedAt: string
  author: { id: string; name: string; image: string | null }
  /** Whether the current caller may edit or delete this one. */
  mine: boolean
}

export async function listComments(cardId: string): Promise<ActionResult<CommentView[]>> {
  return actionResult(async () => {
    const context = await requireCard(cardId, 'comment:read')

    const rows = await getDb()
      .select({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        authorId: user.id,
        authorName: user.name,
        authorImage: user.image,
      })
      .from(comment)
      .innerJoin(user, eq(user.id, comment.authorId))
      .where(eq(comment.cardId, cardId))
      .orderBy(asc(comment.createdAt))

    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: { id: row.authorId, name: row.authorName, image: row.authorImage },
      mine: canModifyComment(context.role, {
        actorId: context.user.id,
        authorId: row.authorId,
      }),
    }))
  })
}

export async function createComment(
  cardId: string,
  body: string,
): Promise<ActionResult<{ commentId: string }>> {
  return actionResult(async () => {
    const context = await requireCard(cardId, 'comment:create')

    const text = body.trim()
    if (text.length === 0) throw new Error('Write something first.')
    if (text.length > MAX_BODY) throw new Error('That comment is too long.')

    const [created] = await getDb()
      .insert(comment)
      .values({ cardId, authorId: context.user.id, body: text })
      .returning({ id: comment.id })

    if (!created) throw new Error('Could not post the comment.')

    await publish(context.boardId, {
      type: 'comment.created',
      boardId: context.boardId,
      cardId,
      commentId: created.id,
    })
    return { commentId: created.id }
  })
}

export async function updateComment(commentId: string, body: string): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireComment(commentId, 'comment:read')

    // Editing your own is allowed for anyone who can comment. Editing
    // somebody else's needs the moderate permission.
    if (!canModifyComment(context.role, { actorId: context.user.id, authorId: context.authorId })) {
      throw new Error('You can only edit your own comments.')
    }

    const text = body.trim()
    if (text.length === 0) throw new Error('A comment cannot be empty.')
    if (text.length > MAX_BODY) throw new Error('That comment is too long.')

    await getDb()
      .update(comment)
      .set({ body: text, updatedAt: new Date() })
      .where(eq(comment.id, commentId))

    return null
  })
}

export async function deleteComment(commentId: string): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireComment(commentId, 'comment:read')

    if (!canModifyComment(context.role, { actorId: context.user.id, authorId: context.authorId })) {
      throw new Error('You can only delete your own comments.')
    }

    const db = getDb()
    const rows = await db
      .select({ cardId: comment.cardId })
      .from(comment)
      .where(eq(comment.id, commentId))
      .limit(1)
    const row = rows[0]
    if (!row) throw new NotFoundError('Comment')

    await db.delete(comment).where(eq(comment.id, commentId))

    const card = await requireCard(row.cardId, 'comment:read')
    await publish(card.boardId, {
      type: 'comment.deleted',
      boardId: card.boardId,
      cardId: row.cardId,
      commentId,
    })
    return null
  })
}
