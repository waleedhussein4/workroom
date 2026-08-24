'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormError } from '@/components/auth/form-error'
import { GithubButton } from '@/components/auth/github-button'
import { authClient } from '@/lib/auth-client'

const MIN_PASSWORD = 8

export function SignUpForm({
  githubEnabled,
  redirectTo,
}: {
  githubEnabled: boolean
  redirectTo: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setError(null)

    const name = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')

    if (name.length === 0) return setError('Add a name so your team knows who you are.')
    if (password.length < MIN_PASSWORD) {
      return setError(`Use at least ${MIN_PASSWORD} characters for your password.`)
    }

    setPending(true)
    const { error: signUpError } = await authClient.signUp.email({ name, email, password })
    setPending(false)

    if (signUpError) {
      setError(
        signUpError.status === 422
          ? 'That email is already registered. Try signing in instead.'
          : 'Could not create the account. Try again in a moment.',
      )
      return
    }

    setSent(email)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-foreground text-sm">
          Check <span className="font-medium">{sent}</span> for a confirmation link.
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          You need to confirm the address before signing in. The link expires in an hour.
        </p>
      </div>
    )
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
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required placeholder="Ada Lovelace" />
        </div>

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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-muted-foreground text-xs">
            At least {MIN_PASSWORD} characters.
          </p>
        </div>

        <FormError message={error} />

        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Create account
        </Button>
      </form>
    </div>
  )
}
