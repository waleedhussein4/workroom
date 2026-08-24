'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from '@/components/workspace/user-menu'
import { cn } from '@/lib/utils'

interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  role: string
}

export function WorkspaceNav({
  current,
  workspaces,
  user,
}: {
  current: { slug: string; name: string; role: string }
  workspaces: WorkspaceSummary[]
  user: { name: string; email: string; image: string | null }
}) {
  const pathname = usePathname()
  const base = `/w/${current.slug}`

  const tabs = [
    { href: base, label: 'Boards', match: (p: string) => p === base || p.startsWith(`${base}/b/`) },
    {
      href: `${base}/docs`,
      label: 'Docs',
      match: (p: string) => p.startsWith(`${base}/docs`),
    },
    {
      href: `${base}/members`,
      label: 'Members',
      match: (p: string) => p.startsWith(`${base}/members`),
    },
  ]

  return (
    <header className="border-border/70 border-b max-sm:h-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:h-14 sm:flex-nowrap sm:py-0 sm:px-6">
        <div className="flex items-center gap-2">
          <Link
            href="/workspaces"
            className="text-foreground shrink-0 text-sm font-semibold tracking-tight"
          >
            Workroom
          </Link>
          <span className="text-border" aria-hidden>
            /
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" className="gap-1.5">
                  {current.name}
                  <ChevronsUpDown className="text-muted-foreground size-3.5" aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-60">
              {workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.id}
                  render={<Link href={{ pathname: `/w/${workspace.slug}` }} />}
                >
                  <Check
                    className={cn(
                      'size-4',
                      workspace.slug === current.slug ? 'opacity-100' : 'opacity-0',
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{workspace.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/workspaces" />}>
                <Plus className="size-4" aria-hidden />
                All workspaces
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav
          className="order-3 flex w-full items-center gap-1 overflow-x-auto pb-2 sm:order-none sm:w-auto sm:pb-0"
          aria-label="Workspace sections"
        >
          {tabs.map((tab) => {
            const active = tab.match(pathname)
            return (
              <Link
                key={tab.href}
                href={{ pathname: tab.href }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-sm transition-colors duration-(--duration-micro)',
                  active
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserMenu name={user.name} email={user.email} image={user.image} />
        </div>
      </div>
    </header>
  )
}
