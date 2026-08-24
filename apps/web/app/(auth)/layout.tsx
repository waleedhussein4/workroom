import Link from 'next/link'
import { ThemeToggle } from '@/components/theme-toggle'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-6">
        <Link href="/" className="text-foreground text-base font-semibold tracking-tight">
          Workroom
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pt-10 pb-20 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  )
}
