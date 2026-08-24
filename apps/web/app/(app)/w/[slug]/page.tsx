import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { KanbanSquare } from 'lucide-react'
import { board, getDb } from '@workroom/db'
import { can } from '@workroom/core'
import { NotFoundError, requireWorkspaceBySlug } from '@/server/guard'
import { countCards } from '@/server/actions/board'
import { StateView } from '@/components/state-view'
import { CreateBoardButton } from '@/components/board/create-board-button'

export const metadata: Metadata = { title: 'Boards' }

export default async function BoardsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let context
  try {
    context = await requireWorkspaceBySlug(slug)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const boards = await getDb()
    .select()
    .from(board)
    .where(eq(board.orgId, context.organizationId))
    .orderBy(asc(board.name))

  const counts = await countCards(boards.map((b) => b.id))
  const canCreate = can(context.role, 'board:create')

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-xl font-semibold tracking-tight">Boards</h1>
          <p className="text-muted-foreground mt-1 text-sm">{context.name}</p>
        </div>
        {canCreate ? <CreateBoardButton organizationId={context.organizationId} /> : null}
      </div>

      {boards.length === 0 ? (
        <div className="border-border mt-8 rounded-xl border border-dashed">
          <StateView
            icon={<KanbanSquare className="size-4" aria-hidden />}
            title="No boards yet"
            description="A board holds columns and cards. Most teams start with one and split later."
            action={
              canCreate ? <CreateBoardButton organizationId={context.organizationId} /> : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((item) => (
            <li key={item.id}>
              <Link
                href={{ pathname: `/w/${slug}/b/${item.id}` }}
                className="border-border bg-card hover:border-border-strong flex h-24 flex-col justify-between rounded-xl border p-4 transition-colors duration-(--duration-micro)"
              >
                <span className="text-foreground text-sm font-medium">{item.name}</span>
                <span className="text-muted-foreground tabular text-xs">
                  {counts[item.id] ?? 0} {(counts[item.id] ?? 0) === 1 ? 'card' : 'cards'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
