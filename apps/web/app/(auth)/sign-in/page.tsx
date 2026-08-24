import type { Metadata } from 'next'
import Link from 'next/link'
import { SignInForm } from '@/components/auth/sign-in-form'
import { AuthCard } from '@/components/auth/auth-card'
import { githubCredentials } from '@/server/env'

export const metadata: Metadata = { title: 'Sign in' }

export default function SignInPage() {
  // GitHub is only offered when the app has been configured with credentials,
  // so a fresh clone does not show a button that cannot work.
  const githubEnabled = Boolean(githubCredentials())

  return (
    <AuthCard
      title="Sign in"
      description="Pick up where your team left off."
      footer={
        <span>
          No account yet?{' '}
          <Link href="/sign-up" className="text-foreground font-medium hover:underline">
            Create one
          </Link>
        </span>
      }
    >
      <SignInForm githubEnabled={githubEnabled} />
    </AuthCard>
  )
}
