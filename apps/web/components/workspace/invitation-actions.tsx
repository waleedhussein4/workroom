'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/auth/form-error'
import { acceptInvitation, declineInvitation } from '@/server/actions/invitation'

export function InvitationActions({ id, slug }: { id: string; slug: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />

      <div className="flex flex-col gap-2">
        <Button
          disabled={pending !== null}
          onClick={async () => {
            setError(null)
            setPending('accept')
            const result = await acceptInvitation(id)
            if (!result.ok) {
              setPending(null)
              setError(result.error)
              return
            }
            // Left pending through the navigation rather than flashing idle.
            router.push(`/w/${result.data.slug}`)
            router.refresh()
          }}
        >
          {pending === 'accept' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Accept invitation
        </Button>

        <Button
          variant="ghost"
          disabled={pending !== null}
          onClick={async () => {
            setError(null)
            setPending('decline')
            const result = await declineInvitation(id)
            setPending(null)
            if (!result.ok) {
              setError(result.error)
              return
            }
            toast.success('Invitation declined.')
            router.push('/workspaces')
          }}
        >
          {pending === 'decline' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Decline
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">Workspace: {slug}</p>
    </div>
  )
}
