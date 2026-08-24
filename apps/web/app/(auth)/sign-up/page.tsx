import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard } from '@/components/auth/auth-card'
import { SignUpForm } from '@/components/auth/sign-up-form'
import { githubCredentials } from '@/server/env'

export const metadata: Metadata = { title: 'Create an account' }

export default function SignUpPage() {
  const githubEnabled = Boolean(githubCredentials())

  return (
    <AuthCard
      title="Create an account"
      description="Set up a workspace and invite your team."
      footer={
        <span>
          Already have one?{' '}
          <Link href="/sign-in" className="text-foreground font-medium hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      <SignUpForm githubEnabled={githubEnabled} />
    </AuthCard>
  )
}
