'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormError } from '@/components/auth/form-error'
import { authClient } from '@/lib/auth-client'

const MIN_PASSWORD = 8

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!token) {
    return (
      <p className="text-muted-foreground text-sm leading-relaxed">
        This reset link is incomplete or has expired. Request a new one from the sign-in page.
      </p>
    )
  }

  async function onSubmit(formData: FormData) {
    setError(null)
    const password = String(formData.get('password') ?? '')
    const confirm = String(formData.get('confirm') ?? '')

    if (password.length < MIN_PASSWORD) {
      return setError(`Use at least ${MIN_PASSWORD} characters.`)
    }
    if (password !== confirm) return setError('Those two passwords do not match.')

    setPending(true)
    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token: token as string,
    })
    setPending(false)

    if (resetError) {
      setError('That reset link has expired. Request a new one.')
      return
    }
    router.push('/sign-in')
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
        />
      </div>
      <FormError message={error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Set new password
      </Button>
    </form>
  )
}
