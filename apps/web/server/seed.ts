import 'server-only'
import { keysBetween, type OrderKey } from '@workroom/core'
import { board, boardColumn, card, document, getDb } from '@workroom/db'

/**
 * Content for a brand new workspace.
 *
 * A workspace that opens on "No boards yet" is a bad first impression for a
 * product whose whole claim is that it feels alive, and it gives someone
 * trying the app nothing to drag. This seeds one board with cards already in
 * it, plus a document, so the first screen has something to do.
 *
 * The cards describe the app rather than being lorem ipsum, so the demo
 * doubles as an explanation.
 */

const COLUMNS = ['Backlog', 'In progress', 'Done'] as const

const CARDS: Record<(typeof COLUMNS)[number], { title: string; description?: string }[]> = {
  Backlog: [
    {
      title: 'Drag this card to another column',
      description:
        'Open this board in a second window first. The card moves in both, and the order stays the same in each.',
    },
    { title: 'Invite someone from the Members tab' },
    { title: 'Rename a column by clicking its title' },
  ],
  'In progress': [
    {
      title: 'Try the Docs tab',
      description:
        'Open the same document in two windows and type in the same paragraph. Both sets of keystrokes survive.',
    },
    { title: 'Leave a comment on a card' },
  ],
  Done: [{ title: 'Create a workspace' }],
}

const WELCOME_DOC = 'Welcome'

export async function seedWorkspace(organizationId: string, userId: string): Promise<void> {
  const db = getDb()

  const [created] = await db
    .insert(board)
    .values({ orgId: organizationId, name: 'First board', createdBy: userId })
    .returning({ id: board.id })

  if (!created) return

  const columnKeys = keysBetween(null, null, COLUMNS.length)
  const columns = await db
    .insert(boardColumn)
    .values(
      COLUMNS.map((name, index) => ({
        boardId: created.id,
        name,
        position: columnKeys[index] as string,
      })),
    )
    .returning({ id: boardColumn.id, name: boardColumn.name })

  const rows = columns.flatMap((column) => {
    const entries = CARDS[column.name as (typeof COLUMNS)[number]] ?? []
    // Generated together rather than one at a time, which keeps the keys
    // short and evenly spaced instead of each one bisecting the last.
    const positions = keysBetween(null, null, entries.length) as OrderKey[]
    return entries.map((entry, index) => ({
      boardId: created.id,
      columnId: column.id,
      title: entry.title,
      description: entry.description ?? null,
      position: positions[index] as string,
      createdBy: userId,
    }))
  })

  if (rows.length > 0) await db.insert(card).values(rows)

  await db.insert(document).values({
    orgId: organizationId,
    boardId: created.id,
    title: WELCOME_DOC,
    createdBy: userId,
  })
}
