'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteDocument, renameDocument } from '@/server/actions/document'

export function DocHeader({
  documentId,
  title,
  canEdit,
  workspaceSlug,
}: {
  documentId: string
  title: string
  canEdit: boolean
  workspaceSlug: string
}) {
  const router = useRouter()
  const [value, setValue] = useState(title)

  async function commit() {
    const next = value.trim()
    if (next === title || next.length === 0) {
      setValue(title)
      return
    }
    const result = await renameDocument(documentId, next)
    if (!result.ok) {
      setValue(title)
      toast.error(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setValue(title)
            event.currentTarget.blur()
          }
        }}
        readOnly={!canEdit}
        aria-label="Document title"
        className="text-foreground w-full max-w-lg rounded-md bg-transparent text-lg font-semibold tracking-tight outline-none"
      />

      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Document options">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                const result = await deleteDocument(documentId)
                if (!result.ok) return toast.error(result.error)
                router.push(`/w/${workspaceSlug}/docs`)
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
