import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, ChevronRight } from 'lucide-react'
import { listWorkspaces, requireUser } from '@/server/guard'
import { StateView } from '@/components/state-view'
import { ThemeToggle } from '@/components/theme-toggle'
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog'
import { UserMenu } from '@/components/workspace/user-menu'

export const metadata: Metadata = { title: 'Workspaces' }

export default async function WorkspacesPage() {
  const user = await requireUser()
  const workspaces = await listWorkspaces(user.id)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border/70 border-b">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-6">
          <span className="text-foreground text-base font-semibold tracking-tight">Workroom</span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} image={user.image} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-xl font-semibold tracking-tight">Workspaces</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {workspaces.length === 0
                ? 'Create one to get started.'
                : `You belong to ${workspaces.length} ${workspaces.length === 1 ? 'workspace' : 'workspaces'}.`}
            </p>
          </div>
          <CreateWorkspaceDialog />
        </div>

        {workspaces.length === 0 ? (
          <div className="border-border mt-8 rounded-xl border border-dashed">
            <StateView
              icon={<Building2 className="size-4" aria-hidden />}
              title="No workspaces yet"
              description="A workspace holds your boards, documents and teammates. You can belong to as many as you like."
              action={<CreateWorkspaceDialog />}
            />
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-2">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  href={{ pathname: `/w/${workspace.slug}` }}
                  className="border-border bg-card hover:border-border-strong group flex items-center justify-between rounded-lg border px-4 py-3 transition-colors duration-(--duration-micro)"
                >
                  <span className="flex items-center gap-3">
                    <span className="bg-primary-subtle text-primary flex size-8 items-center justify-center rounded-md text-xs font-semibold uppercase">
                      {workspace.name.slice(0, 2)}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-foreground text-sm font-medium">{workspace.name}</span>
                      <span className="text-muted-foreground text-xs capitalize">
                        {workspace.role}
                      </span>
                    </span>
                  </span>
                  <ChevronRight
                    className="text-muted-foreground group-hover:text-foreground size-4 transition-colors duration-(--duration-micro)"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
