import Link from 'next/link'
import { ArrowRight, KanbanSquare, FileText, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

const FEATURES = [
  {
    Icon: KanbanSquare,
    title: 'Boards that keep their order',
    body: 'Drag a card and everyone sees it move. Two people dragging at once still end up looking at the same column, which is harder than it sounds.',
  },
  {
    Icon: FileText,
    title: 'Documents you can share a paragraph with',
    body: 'Write at the same time as someone else, in the same sentence. Merging happens per character, so nobody overwrites anybody.',
  },
  {
    Icon: Users,
    title: 'You can see who is around',
    body: 'Cursors with names, avatars on the boards people are looking at, and a marker on the card somebody is dragging right now.',
  },
]

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border/70 border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <span className="text-foreground text-base font-semibold tracking-tight">Workroom</span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button render={<Link href="/sign-in" />} size="sm" variant="ghost">
              Sign in
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 pt-20 pb-16">
          <p className="text-primary mb-4 text-xs font-medium tracking-wide uppercase">
            Plan and write in one place
          </p>
          <h1 className="text-foreground max-w-2xl text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            A workspace for small teams that actually keeps up
          </h1>
          <p className="text-muted-foreground mt-5 max-w-xl text-base leading-relaxed">
            Kanban boards for the work, live documents for the thinking, and everything syncs as it
            happens. Built for teams of two to five who would rather not run three separate tools.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button render={<Link href="/sign-up" />}>
              Create a workspace
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            <Button render={<Link href="/sign-in" />} variant="outline">
              Sign in
            </Button>
          </div>
        </section>

        <section className="border-border/70 border-t">
          <div className="mx-auto grid w-full max-w-5xl gap-px px-6 sm:grid-cols-3 sm:px-0">
            {FEATURES.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="border-border/70 px-6 py-10 sm:border-r sm:last:border-r-0"
              >
                <Icon className="text-primary size-5" aria-hidden />
                <h2 className="text-foreground mt-4 text-base font-medium">{title}</h2>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-border/70 border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6 text-xs">
          <span>Workroom</span>
          <a
            href="https://github.com/waleedhussein4/workroom"
            className="hover:text-foreground transition-colors duration-(--duration-micro)"
          >
            Source
          </a>
        </div>
      </footer>
    </div>
  )
}
