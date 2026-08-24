import { eq, inArray } from 'drizzle-orm'
import { keyBetween, type OrderKey, type RandomBit } from '@workroom/core'
import { card, type Transaction } from '@workroom/db'

export interface PlaceCardInput {
  cardId: string
  toColumnId: string
  /** The card the moved card lands after, or null for the top of the column. */
  beforeId: string | null
  /** The card the moved card lands before, or null for the bottom. */
  afterId: string | null
}

export interface PlaceCardResult {
  position: string
  columnId: string
}

/**
 * Writes a card's new column and order key, inside a transaction the caller
 * already opened.
 *
 * This is the half of `moveCard` that has to be correct under concurrency, and
 * it is separated from the action so it can be called twice at once by a test
 * against a real Postgres. Authorization stays in the action: nothing here
 * checks who is asking, so nothing here may be reached from a request.
 *
 * The two neighbours are locked with `SELECT ... FOR UPDATE` before their keys
 * are read. That is what makes two people dropping into the same gap safe. The
 * second transaction blocks until the first commits and then reads committed
 * state, rather than computing a key from a view of the board that has already
 * moved on.
 */
export async function placeCard(
  tx: Transaction,
  input: PlaceCardInput,
  options: { randomBit?: RandomBit } = {},
): Promise<PlaceCardResult> {
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
  // write landing. Treat a missing one as an open end rather than failing the
  // move: the card still lands somewhere sensible.
  const lowerKey =
    before && before.columnId === input.toColumnId ? (before.position as OrderKey) : null
  const upperKey =
    after && after.columnId === input.toColumnId ? (after.position as OrderKey) : null

  const jitter = options.randomBit ? { randomBit: options.randomBit } : {}

  const position =
    lowerKey !== null && upperKey !== null && lowerKey >= upperKey
      ? // The neighbours are no longer adjacent or have swapped. Append after
        // the lower one rather than throwing.
        keyBetween(lowerKey, null, jitter)
      : keyBetween(lowerKey, upperKey, jitter)

  await tx
    .update(card)
    .set({ columnId: input.toColumnId, position, updatedAt: new Date() })
    .where(eq(card.id, input.cardId))

  return { position: position as string, columnId: input.toColumnId }
}
