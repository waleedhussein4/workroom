'use client'

import { useState } from 'react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormError } from '@/components/auth/form-error'
import { GithubButton } from '@/components/auth/github-button'
import { authClient } from '@/lib/auth-client'

export function SignInForm({
  githubEnabled,
  redirectTo,
}: {
  githubEnabled: boolean
  redirectTo: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setError(null)
    setPending(true)

    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')

    const { error: signInError } = await authClient.signIn.email({ email, password })

    if (signInError) {
      // Better Auth returns the same shape whether the address is unknown or
      // the password is wrong, which is what keeps this from being an account
      // enumeration oracle. Keep the message equally vague.
      setPending(false)
      setError('That email and password do not match an account.')
      return
    }

    // Deliberately not clearing pending: the button stays busy through the
    // navigation rather than flashing back to idle first.
    // typedRoutes cannot check a value that is only known at runtime. The cast
    // is safe because safeNext has already rejected anything that is not a
    // plain in-app path.
    router.push(redirectTo as Route)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-5">
      {githubEnabled ? (
        <>
          <GithubButton label="Continue with GitHub" redirectTo={redirectTo} />
          <div className="flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-2xs uppercase">or</span>
            <span className="bg-border h-px flex-1" />
          </div>
        </>
      ) : null}

      <form action={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              Forgot?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <FormError message={error} />

        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Sign in
        </Button>
      </form>
    </div>
  )
}
