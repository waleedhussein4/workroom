import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { eq, inArray, sql } from 'drizzle-orm'
import { can } from '@workroom/core'
import { cardLabel, comment, getDb, label, member, user } from '@workroom/db'
import { NotFoundError, requireBoard } from '@/server/guard'
import { loadBoard } from '@/server/actions/board'
import { BoardView } from '@/components/board/board-view'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ boardId: string }>
}): Promise<Metadata> {
  const { boardId } = await params
  try {
    const context = await requireBoard(boardId, 'board:read')
    return { title: context.boardName }
  } catch {
    return { title: 'Board' }
  }
}

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params

  let data
  try {
    data = await loadBoard(boardId)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const { context, columns, cards } = data
  const db = getDb()

  const cardIds = cards.map((c) => c.id)

  const [members, commentCounts, labels, cardLabels] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, image: user.image })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, context.organizationId)),
    cardIds.length > 0
      ? db
          .select({ cardId: comment.cardId, count: sql<number>`cast(count(*) as int)` })
          .from(comment)
          .where(inArray(comment.cardId, cardIds))
          .groupBy(comment.cardId)
      : Promise.resolve([] as { cardId: string; count: number }[]),
    db
      .select({ id: label.id, name: label.name, color: label.color })
      .from(label)
      .where(eq(label.orgId, context.organizationId)),
    cardIds.length > 0
      ? db
          .select({
            cardId: cardLabel.cardId,
            labelId: cardLabel.labelId,
            name: label.name,
            color: label.color,
          })
          .from(cardLabel)
          .innerJoin(label, eq(label.id, cardLabel.labelId))
          .where(inArray(cardLabel.cardId, cardIds))
      : Promise.resolve([] as { cardId: string; labelId: string; name: string; color: string }[]),
  ])

  const counts = new Map(commentCounts.map((row) => [row.cardId, row.count]))

  // Grouped once rather than filtered per card, so a board with many cards
  // does not turn rendering into a quadratic scan.
  const labelsByCard = new Map<string, { id: string; name: string; color: string }[]>()
  for (const row of cardLabels) {
    const list = labelsByCard.get(row.cardId) ?? []
    list.push({ id: row.labelId, name: row.name, color: row.color })
    labelsByCard.set(row.cardId, list)
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="text-foreground text-lg font-semibold tracking-tight">
          {context.boardName}
        </h1>
      </div>

      <div className="min-h-0 flex-1">
        <BoardView
          boardId={boardId}
          canEdit={can(context.role, 'card:update')}
          currentUser={{ id: context.user.id, name: context.user.name }}
          members={members}
          labels={labels}
          columns={columns.map((column) => ({
            id: column.id,
            name: column.name,
            position: column.position,
          }))}
          cards={cards.map((item) => ({
            id: item.id,
            columnId: item.columnId,
            title: item.title,
            description: item.description,
            assigneeId: item.assigneeId,
            dueDate: item.dueDate ? item.dueDate.toISOString() : null,
            position: item.position,
            commentCount: counts.get(item.id) ?? 0,
            labels: labelsByCard.get(item.id) ?? [],
          }))}
        />
      </div>
    </div>
  )
}
