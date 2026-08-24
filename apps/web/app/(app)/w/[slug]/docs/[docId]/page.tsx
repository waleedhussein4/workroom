import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { can } from '@workroom/core'
import { NotFoundError, requireDocument } from '@/server/guard'
import { DocHeader } from '@/components/doc/doc-header'
import { EditorLoader } from '@/components/doc/editor-loader'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ docId: string }>
}): Promise<Metadata> {
  const { docId } = await params
  try {
    const context = await requireDocument(docId, 'doc:read')
    return { title: context.title }
  } catch {
    return { title: 'Document' }
  }
}

/** Eight fixed presence hues, assigned by hashing the user id. */
function presenceColour(userId: string): string {
  let hash = 0
  for (let index = 0; index < userId.length; index++) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0
  }
  const hues = [25, 60, 140, 190, 240, 285, 330, 100]
  const lightness = [0.65, 0.7, 0.68, 0.68, 0.65, 0.62, 0.65, 0.68]
  const chroma = [0.19, 0.17, 0.16, 0.13, 0.16, 0.19, 0.19, 0.15]
  const index = hash % hues.length
  return `oklch(${lightness[index]} ${chroma[index]} ${hues[index]})`
}

export default async function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params

  let context
  try {
    context = await requireDocument(docId, 'doc:read')
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const canEdit = can(context.role, 'doc:update')

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <DocHeader
        documentId={docId}
        title={context.title}
        canEdit={canEdit}
        workspaceSlug={context.slug}
      />
      <EditorLoader
        documentId={docId}
        canEdit={canEdit}
        user={{
          id: context.user.id,
          name: context.user.name,
          // Resolved to a literal colour here rather than a CSS variable,
          // because it is sent over awareness and rendered as an inline style
          // in other people's browsers.
          color: presenceColour(context.user.id),
        }}
      />
    </div>
  )
}
