'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createDocument } from '@/server/actions/document'

export function CreateDocButton({
  organizationId,
  slug,
}: {
  organizationId: string
  slug: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        const data = new FormData()
        data.set('title', 'Untitled')
        const result = await createDocument(organizationId, data)
        setPending(false)
        if (!result.ok) return toast.error(result.error)
        router.push(`/w/${slug}/docs/${result.data.documentId}`)
      }}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Plus className="size-4" aria-hidden />
      )}
      New doc
    </Button>
  )
}
