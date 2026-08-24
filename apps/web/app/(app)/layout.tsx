import { redirect } from 'next/navigation'
import { getSession } from '@/server/guard'
import { Toaster } from '@/components/ui/sonner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // A layout guard is convenience, not security. Every action and every data
  // read re-checks; this only saves rendering a page the user cannot use.
  const user = await getSession()
  if (!user) redirect('/sign-in')

  return (
    <>
      {children}
      <Toaster position="bottom-right" />
    </>
  )
}
