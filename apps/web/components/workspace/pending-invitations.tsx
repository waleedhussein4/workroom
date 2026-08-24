'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { revokeInvitation } from '@/server/actions/workspace'
import { useRouter } from 'next/navigation'

export interface PendingInvitation {
  id: string
  email: string
  role: string
}

/**
 * Pending invitations, each with a copyable link.
 *
 * The link matters more than it looks. Invitation email only goes out when a
 * mail provider is configured, and without one the link is otherwise only
 * visible in the server log. Being able to copy and send it by hand keeps the
 * flow usable either way.
 */
export function PendingInvitations({
  invitations,
  organizationId,
}: {
  invitations: PendingInvitation[]
  organizationId: string
}) {
  const router = useRouter()
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (invitations.length === 0) return null

  return (
    <div className="mt-10">
      <h2 className="text-foreground text-sm font-medium">Pending invitations</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Copy a link and send it yourself if email is not configured.
      </p>

      <ul className="border-border mt-3 divide-y rounded-lg border">
        {invitations.map((item) => (
          <li
            key={item.id}
            data-invitation-id={item.id}
            className="flex items-center gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm">{item.email}</p>
              <p className="text-muted-foreground text-xs capitalize">{item.role}</p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const url = `${window.location.origin}/invitations/${item.id}`
                try {
                  await navigator.clipboard.writeText(url)
                  setCopied(item.id)
                  setTimeout(() => setCopied(null), 2000)
                } catch {
                  // Clipboard access can be refused, and an unexplained
                  // no-op is worse than a fallback the user can act on.
                  toast.info(url)
                }
              }}
            >
              {copied === item.id ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {copied === item.id ? 'Copied' : 'Copy link'}
            </Button>

            <button
              type="button"
              aria-label={`Revoke invitation for ${item.email}`}
              disabled={busy === item.id}
              className="text-muted-foreground hover:text-destructive"
              onClick={async () => {
                setBusy(item.id)
                const result = await revokeInvitation(organizationId, item.id)
                setBusy(null)
                if (!result.ok) return toast.error(result.error)
                router.refresh()
              }}
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
