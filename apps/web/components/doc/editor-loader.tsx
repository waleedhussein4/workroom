'use client'

import dynamic from 'next/dynamic'
import type { EditorUser } from '@/components/doc/editor'

/**
 * Loads the editor on the client only.
 *
 * ProseMirror touches `document` at import time, so this cannot be server
 * rendered. `next/dynamic` with ssr disabled is not allowed directly inside a
 * Server Component, which is why this thin client wrapper exists.
 */
const DocEditor = dynamic(() => import('@/components/doc/editor').then((m) => m.DocEditor), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="flex flex-col gap-3" aria-label="Loading editor">
        <div className="bg-muted h-6 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-4 w-full animate-pulse rounded" />
        <div className="bg-muted h-4 w-5/6 animate-pulse rounded" />
      </div>
    </div>
  ),
})

export function EditorLoader(props: { documentId: string; user: EditorUser; canEdit: boolean }) {
  return <DocEditor {...props} />
}
