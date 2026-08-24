'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteMember } from '@/server/actions/workspace'

export function InviteForm({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    const result = await inviteMember(organizationId, formData)
    setPending(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success('Invitation sent.')
    formRef.current?.reset()
    // Without this the new invitation does not appear until the page is
    // reloaded by hand, which reads as the invite having silently failed.
    router.refresh()
  }

  return (
    <form
      action={onSubmit}
      className="border-border bg-card flex items-end gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="invite-email">Invite by email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="teammate@example.com"
          disabled={pending}
        />
      </div>

      <div className="flex w-32 flex-col gap-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue="member"
          disabled={pending}
          className="border-input bg-card text-foreground focus-visible:border-ring h-8 rounded-md border px-2 text-sm outline-none"
        >
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <UserPlus className="size-4" aria-hidden />
        )}
        Invite
      </Button>
    </form>
  )
}
