import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { FileText } from 'lucide-react'
import { can } from '@workroom/core'
import { document, getDb } from '@workroom/db'
import { NotFoundError, requireWorkspaceBySlug } from '@/server/guard'
import { StateView } from '@/components/state-view'
import { CreateDocButton } from '@/components/doc/create-doc-button'

export const metadata: Metadata = { title: 'Docs' }

export default async function DocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let context
  try {
    context = await requireWorkspaceBySlug(slug)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const docs = await getDb()
    .select()
    .from(document)
    .where(eq(document.orgId, context.organizationId))
    .orderBy(desc(document.updatedAt))

  const canCreate = can(context.role, 'doc:create')

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-xl font-semibold tracking-tight">Docs</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Write together, in the same paragraph if you like.
          </p>
        </div>
        {canCreate ? <CreateDocButton organizationId={context.organizationId} slug={slug} /> : null}
      </div>

      {docs.length === 0 ? (
        <div className="border-border mt-8 rounded-xl border border-dashed">
          <StateView
            icon={<FileText className="size-4" aria-hidden />}
            title="No documents yet"
            description="Notes, specs, meeting minutes. Anything several people need to edit at once."
            action={
              canCreate ? (
                <CreateDocButton organizationId={context.organizationId} slug={slug} />
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {docs.map((item) => (
            <li key={item.id}>
              <Link
                href={{ pathname: `/w/${slug}/docs/${item.id}` }}
                className="border-border bg-card hover:border-border-strong flex items-center justify-between rounded-lg border px-4 py-3 transition-colors duration-(--duration-micro)"
              >
                <span className="flex items-center gap-3">
                  <FileText className="text-muted-foreground size-4" aria-hidden />
                  <span className="text-foreground text-sm font-medium">{item.title}</span>
                </span>
                <time
                  className="text-muted-foreground text-xs"
                  dateTime={item.updatedAt.toISOString()}
                >
                  {formatRelative(item.updatedAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatRelative(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}
