'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    await authClient.requestPasswordReset({
      email: String(formData.get('email') ?? '').trim(),
      redirectTo: '/reset-password',
    })
    setPending(false)
    // Always the same outcome, whether or not the address exists. Telling the
    // user "no such account" turns this form into an account enumeration tool.
    setSent(true)
  }

  if (sent) {
    return (
      <p className="text-muted-foreground text-sm leading-relaxed">
        If that address has an account, a reset link is on its way. The link expires in an hour.
      </p>
    )
  }

  return (
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
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Send reset link
      </Button>
    </form>
  )
}
