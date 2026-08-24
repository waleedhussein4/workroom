import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard } from '@/components/auth/auth-card'

export const metadata: Metadata = { title: 'Confirm your email' }

export default function VerifyEmailPage() {
  return (
    <AuthCard
      title="Confirm your email"
      description="We sent you a link. Open it to finish setting up your account."
      footer={
        <Link href="/sign-in" className="text-foreground font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      <p className="text-muted-foreground text-sm leading-relaxed">
        Nothing arrived? Check spam, or try signing in again to send a fresh link.
      </p>
    </AuthCard>
  )
}
