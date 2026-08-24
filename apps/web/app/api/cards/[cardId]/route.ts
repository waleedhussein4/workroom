import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { card, getDb } from '@workroom/db'
import { ForbiddenError, NotFoundError, UnauthenticatedError, requireCard } from '@/server/guard'

export async function GET(_request: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params

  try {
    await requireCard(cardId, 'card:read')
    const rows = await getDb().select().from(card).where(eq(card.id, cardId)).limit(1)
    const row = rows[0]
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      id: row.id,
      title: row.title,
      description: row.description,
      assigneeId: row.assigneeId,
      dueDate: row.dueDate,
      columnId: row.columnId,
    })
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Forbidden and not-found are both reported as 404 so a card id cannot be
    // probed for existence from outside the workspace.
    if (error instanceof ForbiddenError || error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw error
  }
}
