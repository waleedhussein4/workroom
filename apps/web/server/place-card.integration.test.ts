/**
 * `placeCard` against a real Postgres.
 *
 * Everything else in this repository proves ordering with pure functions, which
 * is fast and covers the logic but cannot say anything about locking, about
 * whether two transactions deadlock, or about whether Postgres agrees with
 * JavaScript on what order two strings go in. Those need a real server.
 *
 * Runs only when DATABASE_URL is set, so `npm test` on a fresh clone stays
 * green with nothing installed. CI sets it against a Postgres service.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asc, eq, sql } from 'drizzle-orm'
import { sortByPosition, type OrderKey } from '@workroom/core'
import { board, boardColumn, card, getDb, closeDb, organization } from '@workroom/db'
import { placeCard } from './place-card'

const DATABASE_URL = process.env.DATABASE_URL

describe.skipIf(!DATABASE_URL)('placeCard against Postgres', () => {
  const db = getDb()
  const runId = crypto.randomUUID()
  let orgId: string
  let boardId: string
  let columnId: string

  /** Opens a transaction that waits for its partner before taking any locks. */
  function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  async function seedCards(titles: string[]) {
    const keys = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5']
    const rows = await db
      .insert(card)
      .values(
        titles.map((title, i) => ({
          boardId,
          columnId,
          title,
          position: keys[i] as string,
        })),
      )
      .returning({ id: card.id, title: card.title, position: card.position })
    return rows
  }

  async function readColumn() {
    return db
      .select({ id: card.id, title: card.title, position: card.position })
      .from(card)
      .where(eq(card.columnId, columnId))
      .orderBy(asc(card.position), asc(card.id))
  }

  beforeAll(async () => {
    orgId = `org-${runId}`
    await db.insert(organization).values({ id: orgId, name: 'Integration', slug: `int-${runId}` })

    const [createdBoard] = await db
      .insert(board)
      .values({ orgId, name: 'Integration board' })
      .returning({ id: board.id })
    boardId = createdBoard!.id

    const [createdColumn] = await db
      .insert(boardColumn)
      .values({ boardId, name: 'Column', position: 'a0' })
      .returning({ id: boardColumn.id })
    columnId = createdColumn!.id
  })

  afterAll(async () => {
    if (orgId) await db.delete(organization).where(eq(organization.id, orgId))
    await closeDb()
  })

  it('survives two transactions dropping into the same gap at once', async () => {
    const [top, bottom, mine, theirs] = await seedCards(['Top', 'Bottom', 'Mine', 'Theirs'])

    // Both transactions are opened and confirmed live before either takes a
    // lock, so this is a genuine overlap rather than two calls that happen to
    // be written next to each other.
    const started = [deferred(), deferred()]
    const bothOpen = Promise.all(started.map((d) => d.promise))

    const move = (index: number, cardId: string) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select 1`)
        started[index]!.resolve()
        await bothOpen
        return placeCard(tx, {
          cardId,
          toColumnId: columnId,
          beforeId: top!.id,
          afterId: bottom!.id,
        })
      })

    // No deadlock, and neither transaction is rolled back. Both neighbours are
    // locked by both callers, so if the lock order were not stable this is
    // where it would surface.
    const results = await Promise.all([move(0, mine!.id), move(1, theirs!.id)])
    expect(results).toHaveLength(2)

    const rows = await readColumn()
    const titles = rows.map((r) => r.title)

    // Which of the two won the gap is not asserted. Either is correct; the
    // neighbours moving is not, and disagreeing about the sequence is not.
    expect(titles[0]).toBe('Top')
    expect(titles.at(-1)).toBe('Bottom')
    expect(titles.slice(1, 3).sort()).toEqual(['Mine', 'Theirs'])

    // Both moved cards landed strictly between the two neighbours.
    const byTitle = new Map(rows.map((r) => [r.title, r.position]))
    for (const title of ['Mine', 'Theirs']) {
      expect(byTitle.get(title)! > byTitle.get('Top')!).toBe(true)
      expect(byTitle.get(title)! < byTitle.get('Bottom')!).toBe(true)
    }

    // And the column is still a total order: no two rows tie on (position, id).
    const seen = new Set(rows.map((r) => `${r.position}\u0000${r.id}`))
    expect(seen.size).toBe(rows.length)

    await db.delete(card).where(eq(card.columnId, columnId))
  }, 30_000)

  it('accepts a duplicate key rather than rejecting the write', async () => {
    const [top, bottom, mine, theirs] = await seedCards(['Top', 'Bottom', 'Mine', 'Theirs'])

    // Jitter is what normally keeps two callers apart. Pinning the bit source
    // removes it, so both moves compute byte-identical keys. That is the case
    // the schema deliberately does not constrain: a unique index on
    // (column_id, position) would turn it into a failed write and a card
    // snapping back on somebody's screen.
    const alwaysLow = () => false
    const input = { toColumnId: columnId, beforeId: top!.id, afterId: bottom!.id }

    const first = await db.transaction((tx) =>
      placeCard(tx, { ...input, cardId: mine!.id }, { randomBit: alwaysLow }),
    )
    const second = await db.transaction((tx) =>
      placeCard(tx, { ...input, cardId: theirs!.id }, { randomBit: alwaysLow }),
    )

    expect(second.position).toBe(first.position)

    const rows = await readColumn()
    expect(rows).toHaveLength(4)

    // Postgres and the client agree on the order despite the tie, which is the
    // whole reason every read sorts by (position, id).
    const asPostgresSorted = rows.map((r) => r.id)
    const asClientSorted = sortByPosition(
      rows.map((r) => ({ id: r.id, position: r.position as OrderKey })),
    ).map((r) => r.id)
    expect(asPostgresSorted).toEqual(asClientSorted)

    await db.delete(card).where(eq(card.columnId, columnId))
  }, 30_000)

  it('sorts positions by byte order, not by locale', async () => {
    // The column is text COLLATE "C" while the database itself is created with
    // a locale collation, so this asserts the per-column override is really
    // there. Without it Postgres returns a0, A0, a0V, z0, Zz and disagrees
    // with every client, which looks exactly like the concurrency bug this
    // design exists to prevent.
    const keys = ['a0V', 'Zz', 'z0', 'A0', 'a0']
    await db.insert(card).values(
      keys.map((position) => ({
        boardId,
        columnId,
        title: position,
        position,
      })),
    )

    const rows = await readColumn()
    expect(rows.map((r) => r.title)).toEqual(['A0', 'Zz', 'a0', 'a0V', 'z0'])
    expect(rows.map((r) => r.title)).toEqual([...keys].sort())

    await db.delete(card).where(eq(card.columnId, columnId))
  }, 30_000)
})
