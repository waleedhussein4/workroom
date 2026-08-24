'use server'

import { revalidatePath } from 'next/cache'
import { desc, eq } from 'drizzle-orm'
import { document, getDb } from '@workroom/db'
import { requireDocument, requireWorkspaceRole } from '@/server/guard'
import { actionResult, type ActionResult } from './result'

export async function createDocument(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  return actionResult(async () => {
    const context = await requireWorkspaceRole(organizationId, 'doc:create')
    const title = String(formData.get('title') ?? '').trim() || 'Untitled'
    const boardId = String(formData.get('boardId') ?? '') || null

    const [created] = await getDb()
      .insert(document)
      .values({
        orgId: organizationId,
        boardId,
        title,
        createdBy: context.user.id,
      })
      .returning({ id: document.id })

    if (!created) throw new Error('Could not create the document.')

    revalidatePath(`/w/${context.slug}/docs`)
    return { documentId: created.id }
  })
}

export async function renameDocument(
  documentId: string,
  title: string,
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireDocument(documentId, 'doc:update')
    const next = title.trim() || 'Untitled'

    await getDb()
      .update(document)
      .set({ title: next, updatedAt: new Date() })
      .where(eq(document.id, documentId))

    revalidatePath(`/w/${context.slug}/docs`)
    return null
  })
}

export async function deleteDocument(documentId: string): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireDocument(documentId, 'doc:delete')
    // document_state cascades, so the Yjs snapshot goes with it.
    await getDb().delete(document).where(eq(document.id, documentId))
    revalidatePath(`/w/${context.slug}/docs`)
    return null
  })
}

/**
 * Records that a document changed.
 *
 * Yjs owns the body and the sync server persists it. This only keeps the
 * listing's "last edited" ordering honest, so it is deliberately cheap and
 * deliberately not on the editing hot path.
 */
export async function touchDocument(documentId: string): Promise<ActionResult<null>> {
  return actionResult(async () => {
    await requireDocument(documentId, 'doc:update')
    await getDb().update(document).set({ updatedAt: new Date() }).where(eq(document.id, documentId))
    return null
  })
}

export async function listDocuments(organizationId: string) {
  await requireWorkspaceRole(organizationId, 'doc:read')
  return getDb()
    .select()
    .from(document)
    .where(eq(document.orgId, organizationId))
    .orderBy(desc(document.updatedAt))
}
