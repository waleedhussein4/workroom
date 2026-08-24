import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MailQuestion } from 'lucide-react'
import { loadInvitation } from '@/server/actions/invitation'
import { InvitationActions } from '@/components/workspace/invitation-actions'
import { AuthCard } from '@/components/auth/auth-card'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Invitation' }

export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const invitation = await loadInvitation(id)
  if (!invitation) notFound()

  const next = encodeURIComponent(`/invitations/${id}`)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-6">
        <Link href="/" className="text-foreground text-base font-semibold tracking-tight">
          Workroom
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pt-10 pb-20 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <AuthCard
            title={
              invitation.state === 'ok'
                ? `Join ${invitation.organizationName}`
                : 'About this invitation'
            }
            description={
              invitation.state === 'ok'
                ? `${invitation.inviterName} invited you as ${invitation.role}.`
                : undefined
            }
          >
            {invitation.state === 'ok' ? (
              <InvitationActions id={invitation.id} slug={invitation.organizationSlug} />
            ) : (
              <Explanation invitation={invitation} next={next} />
            )}
          </AuthCard>
        </div>
      </main>
    </div>
  )
}

function Explanation({
  invitation,
  next,
}: {
  invitation: NonNullable<Awaited<ReturnType<typeof loadInvitation>>>
  next: string
}) {
  if (invitation.state === 'signed-out') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm leading-relaxed">
          <span className="text-foreground font-medium">{invitation.inviterName}</span> invited{' '}
          <span className="text-foreground font-medium">{invitation.invitedEmail}</span> to{' '}
          {invitation.organizationName}. Sign in with that address to accept.
        </p>
        <div className="flex flex-col gap-2">
          <Button render={<Link href={`/sign-in?next=${next}`} />}>Sign in</Button>
          <Button render={<Link href={`/sign-up?next=${next}`} />} variant="outline">
            Create an account
          </Button>
        </div>
      </div>
    )
  }

  if (invitation.state === 'wrong-account') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm leading-relaxed">
          This invitation is for{' '}
          <span className="text-foreground font-medium">{invitation.invitedEmail}</span>, but you
          are signed in as{' '}
          <span className="text-foreground font-medium">{invitation.currentEmail}</span>.
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Sign out and back in with the invited address, or ask {invitation.inviterName} to send a
          new invitation to {invitation.currentEmail}.
        </p>
        <Button render={<Link href="/workspaces" />} variant="outline">
          Back to your workspaces
        </Button>
      </div>
    )
  }

  const message =
    invitation.state === 'expired'
      ? `This invitation to ${invitation.organizationName} has expired. Ask ${invitation.inviterName} for a new one.`
      : `This invitation has already been used. If you accepted it, ${invitation.organizationName} is in your workspace list.`

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground flex items-start gap-2 text-sm leading-relaxed">
        <MailQuestion className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </p>
      <Button render={<Link href="/workspaces" />} variant="outline">
        Back to your workspaces
      </Button>
    </div>
  )
}
