'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { ROLES, canRemoveMember, canSetRole, type Role } from '@workroom/core'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { initialsOf } from '@/components/workspace/user-menu'
import { removeMember, setMemberRole } from '@/server/actions/workspace'

interface MemberRow {
  memberId: string
  userId: string
  name: string
  email: string
  image: string | null
  role: Role
}

export function MembersTable({
  organizationId,
  currentUserId,
  currentRole,
  members,
}: {
  organizationId: string
  currentUserId: string
  currentRole: Role
  members: MemberRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  return (
    <ul className="border-border mt-6 divide-y rounded-lg border">
      {members.map((row) => {
        const isSelf = row.userId === currentUserId
        // The same rules the server enforces, used here only to decide what to
        // show. The server checks again on every call.
        const mayChangeRole = canSetRole(currentRole, 'member') && !isSelf && row.role !== 'owner'
        const mayRemove = !isSelf && canRemoveMember(currentRole, row.role)

        return (
          <li key={row.memberId} className="flex items-center gap-3 px-4 py-3">
            <Avatar className="size-7 shrink-0">
              {row.image ? <AvatarImage src={row.image} alt="" /> : null}
              <AvatarFallback className="text-2xs">{initialsOf(row.name)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-medium">
                {row.name}
                {isSelf ? <span className="text-muted-foreground ml-2 text-xs">you</span> : null}
              </p>
              <p className="text-muted-foreground truncate text-xs">{row.email}</p>
            </div>

            {mayChangeRole ? (
              <select
                aria-label={`Role for ${row.name}`}
                value={row.role}
                disabled={busy === row.memberId}
                onChange={async (event) => {
                  const next = event.target.value
                  setBusy(row.memberId)
                  const result = await setMemberRole(organizationId, row.memberId, next)
                  setBusy(null)
                  if (!result.ok) return toast.error(result.error)
                  router.refresh()
                }}
                className="border-input bg-card text-foreground h-7 rounded-md border px-2 text-xs capitalize outline-none"
              >
                {ROLES.filter((role) => role !== 'owner').map((role) => (
                  <option key={role} value={role} className="capitalize">
                    {role}
                  </option>
                ))}
              </select>
            ) : (
              <Badge variant="secondary" className="capitalize">
                {row.role}
              </Badge>
            )}

            {mayRemove ? (
              <button
                type="button"
                aria-label={`Remove ${row.name}`}
                disabled={busy === row.memberId}
                className="text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  setBusy(row.memberId)
                  const result = await removeMember(organizationId, row.memberId)
                  setBusy(null)
                  if (!result.ok) return toast.error(result.error)
                  router.refresh()
                }}
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : (
              <span className="size-4" aria-hidden />
            )}
          </li>
        )
      })}
    </ul>
  )
}
