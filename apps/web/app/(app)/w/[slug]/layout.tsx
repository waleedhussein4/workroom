import { notFound, redirect } from 'next/navigation'
import {
  NotFoundError,
  UnauthenticatedError,
  listWorkspaces,
  requireWorkspaceBySlug,
} from '@/server/guard'
import { WorkspaceNav } from '@/components/workspace/workspace-nav'

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Resolve first, render after. Building JSX inside a try/catch would let a
  // render-time error be swallowed by the same handler that is meant to catch
  // authorization failures.
  let context
  try {
    context = await requireWorkspaceBySlug(slug)
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect('/sign-in')
    // Not a member and does not exist look identical on purpose, so workspace
    // slugs cannot be probed for existence.
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const workspaces = await listWorkspaces(context.user.id)

  return (
    <div className="flex min-h-dvh flex-col">
      <WorkspaceNav
        current={{ slug: context.slug, name: context.name, role: context.role }}
        workspaces={workspaces}
        user={context.user}
      />
      <main className="flex-1">{children}</main>
    </div>
  )
}
