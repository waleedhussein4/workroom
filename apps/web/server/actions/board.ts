'use server'

import { revalidatePath } from 'next/cache'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import {
  keyBetween,
  keysBetween,
  needsRebalance,
  rebalance,
  sortByPosition,
  type OrderKey,
} from '@workroom/core'
import { board, boardColumn, card, getDb } from '@workroom/db'
import { NotFoundError, requireBoard, requireCard, requireWorkspaceRole } from '@/server/guard'
import { publish } from '@/server/publish'
import { actionResult, type ActionResult } from './result'

const DEFAULT_COLUMNS = ['Backlog', 'In progress', 'Done']

export async function createBoard(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult<{ boardId: string }>> {
  return actionResult(async () => {
    const context = await requireWorkspaceRole(organizationId, 'board:create')
    const name = String(formData.get('name') ?? '').trim() || 'Untitled board'

    const db = getDb()
    const [created] = await db
      .insert(board)
      .values({ orgId: organizationId, name, createdBy: context.user.id })
      .returning({ id: board.id })

    if (!created) throw new Error('Could not create the board.')

    const positions = keysBetween(null, null, DEFAULT_COLUMNS.length)
    await db.insert(boardColumn).values(
      DEFAULT_COLUMNS.map((columnName, index) => ({
        boardId: created.id,
        name: columnName,
        position: positions[index] as string,
      })),
    )

    revalidatePath(`/w/${context.slug}`)
    return { boardId: created.id }
  })
}

export async function renameBoard(
  boardId: string,
  formData: FormData,
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireBoard(boardId, 'board:update')
    const name = String(formData.get('name') ?? '').trim()
    if (name.length === 0) throw new Error('Give the board a name.')

    await getDb().update(board).set({ name, updatedAt: new Date() }).where(eq(board.id, boardId))
    await publish(boardId, { type: 'board.renamed', boardId, name })
    revalidatePath(`/w/${context.slug}`)
    return null
  })
}

export async function deleteBoard(boardId: string): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireBoard(boardId, 'board:delete')
    await getDb().delete(board).where(eq(board.id, boardId))
    revalidatePath(`/w/${context.slug}`)
    return null
  })
}

export async function createColumn(
  boardId: string,
  formData: FormData,
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    await requireBoard(boardId, 'column:create')
    const name = String(formData.get('name') ?? '').trim() || 'New column'

    const db = getDb()
    const existing = await db
      .select({ position: boardColumn.position })
      .from(boardColumn)
      .where(eq(boardColumn.boardId, boardId))
      .orderBy(asc(boardColumn.position), asc(boardColumn.id))

    const last = existing.at(-1)?.position ?? null
    const position = keyBetween(last as OrderKey | null, null)

    await db.insert(boardColumn).values({ boardId, name, position })
    await publish(boardId, { type: 'board.changed', boardId })
    return null
  })
}

export async function renameColumn(
  columnId: string,
  formData: FormData,
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const db = getDb()
    const rows = await db
      .select({ boardId: boardColumn.boardId })
      .from(boardColumn)
      .where(eq(boardColumn.id, columnId))
      .limit(1)
    const row = rows[0]
    if (!row) throw new NotFoundError('Column')

    await requireBoard(row.boardId, 'column:update')
    const name = String(formData.get('name') ?? '').trim()
    if (name.length === 0) throw new Error('Give the column a name.')

    await db.update(boardColumn).set({ name }).where(eq(boardColumn.id, columnId))
    await publish(row.boardId, { type: 'board.changed', boardId: row.boardId })
    return null
  })
}

export async function deleteColumn(columnId: string): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const db = getDb()
    const rows = await db
      .select({ boardId: boardColumn.boardId })
      .from(boardColumn)
      .where(eq(boardColumn.id, columnId))
      .limit(1)
    const row = rows[0]
    if (!row) throw new NotFoundError('Column')

    await requireBoard(row.boardId, 'column:delete')
    await db.delete(boardColumn).where(eq(boardColumn.id, columnId))
    await publish(row.boardId, { type: 'board.changed', boardId: row.boardId })
    return null
  })
}

export async function createCard(
  columnId: string,
  formData: FormData,
): Promise<ActionResult<{ cardId: string }>> {
  return actionResult(async () => {
    const db = getDb()
    const rows = await db
      .select({ boardId: boardColumn.boardId })
      .from(boardColumn)
      .where(eq(boardColumn.id, columnId))
      .limit(1)
    const row = rows[0]
    if (!row) throw new NotFoundError('Column')

    const context = await requireBoard(row.boardId, 'card:create')
    const title = String(formData.get('title') ?? '').trim()
    if (title.length === 0) throw new Error('Give the card a title.')

    const existing = await db
      .select({ position: card.position })
      .from(card)
      .where(eq(card.columnId, columnId))
      .orderBy(asc(card.position), asc(card.id))

    const last = existing.at(-1)?.position ?? null
    const position = keyBetween(last as OrderKey | null, null)

    const [created] = await db
      .insert(card)
      .values({
        boardId: row.boardId,
        columnId,
        title,
        position,
        createdBy: context.user.id,
      })
      .returning({ id: card.id })

    if (!created) throw new Error('Could not create the card.')

    await publish(row.boardId, { type: 'card.created', boardId: row.boardId, cardId: created.id })
    return { cardId: created.id }
  })
}

export async function updateCard(
  cardId: string,
  patch: {
    title?: string
    description?: string | null
    assigneeId?: string | null
    dueDate?: string | null
  },
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireCard(cardId, 'card:update')

    const values: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.title !== undefined) {
      const title = patch.title.trim()
      if (title.length === 0) throw new Error('A card needs a title.')
      values.title = title
    }
    if (patch.description !== undefined) values.description = patch.description
    if (patch.assigneeId !== undefined) values.assigneeId = patch.assigneeId
    if (patch.dueDate !== undefined) {
      values.dueDate = patch.dueDate ? new Date(patch.dueDate) : null
    }

    await getDb().update(card).set(values).where(eq(card.id, cardId))
    await publish(context.boardId, { type: 'card.updated', boardId: context.boardId, cardId })
    return null
  })
}

export async function deleteCard(cardId: string): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireCard(cardId, 'card:delete')
    await getDb().delete(card).where(eq(card.id, cardId))
    await publish(context.boardId, { type: 'card.deleted', boardId: context.boardId, cardId })
    return null
  })
}

export interface MoveCardInput {
  cardId: string
  toColumnId: string
  /** The card that should end up immediately before this one, if any. */
  beforeId: string | null
  /** The card that should end up immediately after this one, if any. */
  afterId: string | null
}

/**
 * Moves a card, generating its new order key on the server.
 *
 * The client sends neighbour ids rather than a key. That is the whole point:
 * the server re-reads those neighbours inside the transaction, so it computes
 * against committed state instead of whatever the dragging client happened to
 * be looking at. Two people dropping into the same gap therefore cannot both
 * write a key derived from a view that has since changed.
 *
 * Duplicate keys are still possible and still harmless, because every read
 * sorts by (position, id). Jitter makes them unlikely rather than certain.
 */
export async function moveCard(
  input: MoveCardInput,
): Promise<ActionResult<{ position: string; columnId: string }>> {
  return actionResult(async () => {
    const context = await requireCard(input.cardId, 'card:update')
    const db = getDb()

    const targetColumns = await db
      .select({ id: boardColumn.id, boardId: boardColumn.boardId })
      .from(boardColumn)
      .where(eq(boardColumn.id, input.toColumnId))
      .limit(1)

    const targetColumn = targetColumns[0]
    if (!targetColumn) throw new NotFoundError('Column')
    // A column id from a different board would otherwise pass the card's own
    // permission check while moving it somewhere the caller never named.
    if (targetColumn.boardId !== context.boardId) {
      throw new Error('That column is on a different board.')
    }

    const result = await db.transaction(async (tx) => {
      // Lock the neighbours so a concurrent move cannot renumber them between
      // the read and the write.
      const neighbourIds = [input.beforeId, input.afterId].filter((id): id is string => id !== null)

      const neighbours =
        neighbourIds.length > 0
          ? await tx
              .select({ id: card.id, position: card.position, columnId: card.columnId })
              .from(card)
              .where(inArray(card.id, neighbourIds))
              .for('update')
          : []

      const before = neighbours.find((n) => n.id === input.beforeId)
      const after = neighbours.find((n) => n.id === input.afterId)

      // A neighbour can vanish or move away between the drag starting and the
      // write landing. Treat a missing one as an open end rather than failing
      // the move: the card still lands in a sensible place.
      const lowerKey =
        before && before.columnId === input.toColumnId ? (before.position as OrderKey) : null
      const upperKey =
        after && after.columnId === input.toColumnId ? (after.position as OrderKey) : null

      let position: OrderKey
      if (lowerKey !== null && upperKey !== null && lowerKey >= upperKey) {
        // The neighbours are no longer adjacent or have swapped. Fall back to
        // appending after the lower one rather than throwing.
        position = keyBetween(lowerKey, null)
      } else {
        position = keyBetween(lowerKey, upperKey)
      }

      await tx
        .update(card)
        .set({ columnId: input.toColumnId, position, updatedAt: new Date() })
        .where(eq(card.id, input.cardId))

      return { position: position as string, columnId: input.toColumnId }
    })

    await publish(context.boardId, {
      type: 'card.moved',
      boardId: context.boardId,
      cardId: input.cardId,
      columnId: result.columnId,
      position: result.position,
      fromColumnId: context.columnId,
    })

    // Long keys only happen after pathological repeated insertion into one
    // gap, but left alone they grow without bound.
    await rebalanceIfNeeded(input.toColumnId, context.boardId)

    return result
  })
}

/** Rewrites a column's keys when they have grown too long. */
async function rebalanceIfNeeded(columnId: string, boardId: string): Promise<void> {
  const db = getDb()
  const rows = await db
    .select({ id: card.id, position: card.position })
    .from(card)
    .where(eq(card.columnId, columnId))

  const positioned = rows.map((row) => ({ id: row.id, position: row.position as OrderKey }))
  if (!needsRebalance(positioned)) return

  const next = rebalance(positioned)
  await db.transaction(async (tx) => {
    for (const entry of next) {
      await tx.update(card).set({ position: entry.position }).where(eq(card.id, entry.id))
    }
  })

  await publish(boardId, { type: 'board.changed', boardId })
}

/** Reorders a column within its board. Same mechanism as moving a card. */
export async function moveColumn(
  columnId: string,
  beforeId: string | null,
  afterId: string | null,
): Promise<ActionResult<{ position: string }>> {
  return actionResult(async () => {
    const db = getDb()
    const rows = await db
      .select({ boardId: boardColumn.boardId })
      .from(boardColumn)
      .where(eq(boardColumn.id, columnId))
      .limit(1)
    const row = rows[0]
    if (!row) throw new NotFoundError('Column')

    await requireBoard(row.boardId, 'column:update')

    const position = await db.transaction(async (tx) => {
      const ids = [beforeId, afterId].filter((id): id is string => id !== null)
      const neighbours =
        ids.length > 0
          ? await tx
              .select({ id: boardColumn.id, position: boardColumn.position })
              .from(boardColumn)
              .where(inArray(boardColumn.id, ids))
              .for('update')
          : []

      const lower = (neighbours.find((n) => n.id === beforeId)?.position ?? null) as OrderKey | null
      const upper = (neighbours.find((n) => n.id === afterId)?.position ?? null) as OrderKey | null
      const next =
        lower !== null && upper !== null && lower >= upper
          ? keyBetween(lower, null)
          : keyBetween(lower, upper)

      await tx.update(boardColumn).set({ position: next }).where(eq(boardColumn.id, columnId))
      return next as string
    })

    await publish(row.boardId, { type: 'board.changed', boardId: row.boardId })
    return { position }
  })
}

/** Reads a whole board. Every ordered read goes through sortByPosition. */
export async function loadBoard(boardId: string) {
  const context = await requireBoard(boardId, 'board:read')
  const db = getDb()

  const [columns, cards] = await Promise.all([
    db
      .select()
      .from(boardColumn)
      .where(eq(boardColumn.boardId, boardId))
      .orderBy(asc(boardColumn.position), asc(boardColumn.id)),
    db
      .select()
      .from(card)
      .where(eq(card.boardId, boardId))
      .orderBy(asc(card.position), asc(card.id)),
  ])

  return {
    context,
    // The SQL already orders by (position, id), but sorting again in the
    // application keeps one implementation of "board order" rather than two
    // that could disagree.
    columns: sortByPosition(columns.map((c) => ({ ...c, position: c.position as OrderKey }))),
    cards: sortByPosition(cards.map((c) => ({ ...c, position: c.position as OrderKey }))),
  }
}

/** Kept for the board list page. */
export async function countCards(boardIds: string[]): Promise<Record<string, number>> {
  if (boardIds.length === 0) return {}
  const rows = await getDb()
    .select({ boardId: card.boardId, count: sql<number>`cast(count(*) as int)` })
    .from(card)
    .where(inArray(card.boardId, boardIds))
    .groupBy(card.boardId)
  return Object.fromEntries(rows.map((r) => [r.boardId, r.count]))
}

export async function listBoards(organizationId: string) {
  await requireWorkspaceRole(organizationId, 'board:read')
  return getDb()
    .select()
    .from(board)
    .where(eq(board.orgId, organizationId))
    .orderBy(asc(board.name))
}
