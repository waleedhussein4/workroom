import { eq } from 'drizzle-orm'
import { createDb, documentState } from '@workroom/db'

/**
 * Yjs state, stored as a single snapshot row per document.
 *
 * The rule that matters: what comes back out is byte for byte what went in.
 * Rebuilding a Y.Doc on the server from editor JSON or HTML produces fresh
 * client ids, and merging that into a live document duplicates the entire
 * contents. Store bytes, return bytes, never reconstruct.
 */

const db = createDb(process.env.DATABASE_URL)

export async function loadDocumentState(documentId: string): Promise<Uint8Array | null> {
  const rows = await db
    .select({ state: documentState.state })
    .from(documentState)
    .where(eq(documentState.documentId, documentId))
    .limit(1)

  return rows[0]?.state ?? null
}

export async function storeDocumentState(documentId: string, state: Uint8Array): Promise<void> {
  await db
    .insert(documentState)
    .values({ documentId, state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: documentState.documentId,
      set: { state, updatedAt: new Date() },
    })
}
