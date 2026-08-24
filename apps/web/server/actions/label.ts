'use server'

import { and, asc, eq } from 'drizzle-orm'
import { cardLabel, getDb, label } from '@workroom/db'
import { NotFoundError, requireCard, requireWorkspaceRole } from '@/server/guard'
import { publish } from '@/server/publish'
import { isLabelColor, type LabelView } from '@/lib/labels'
import { actionResult, type ActionResult } from './result'

/**
 * Labels belong to the workspace, not to a board.
 *
 * That is the useful shape for a small team: "bug" means the same thing on
 * every board, and a card moved between boards keeps its labels. It does mean
 * every membership check resolves through the workspace rather than the card's
 * board, which is why attaching a label checks both.
 */

export async function listLabels(organizationId: string): Promise<ActionResult<LabelView[]>> {
  return actionResult(async () => {
    await requireWorkspaceRole(organizationId, 'board:read')
    const rows = await getDb()
      .select({ id: label.id, name: label.name, color: label.color })
      .from(label)
      .where(eq(label.orgId, organizationId))
      .orderBy(asc(label.name))
    return rows
  })
}

export async function createLabel(
  organizationId: string,
  name: string,
  color: string,
): Promise<ActionResult<LabelView>> {
  return actionResult(async () => {
    await requireWorkspaceRole(organizationId, 'label:manage')

    const trimmed = name.trim()
    if (trimmed.length === 0) throw new Error('Give the label a name.')
    if (trimmed.length > 40) throw new Error('That label name is too long.')
    if (!isLabelColor(color)) throw new Error('Pick one of the available colours.')

    const [created] = await getDb()
      .insert(label)
      .values({ orgId: organizationId, name: trimmed, color })
      .returning({ id: label.id, name: label.name, color: label.color })

    if (!created) throw new Error('Could not create the label.')
    return created
  })
}

export async function deleteLabel(
  organizationId: string,
  labelId: string,
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    await requireWorkspaceRole(organizationId, 'label:manage')
    // Scoped to the workspace, so a label id from elsewhere cannot be deleted
    // by guessing it. card_label rows cascade.
    await getDb()
      .delete(label)
      .where(and(eq(label.id, labelId), eq(label.orgId, organizationId)))
    return null
  })
}

export async function setCardLabel(
  cardId: string,
  labelId: string,
  attached: boolean,
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireCard(cardId, 'card:update')
    const db = getDb()

    // The label has to belong to the same workspace as the card. Without this
    // a card could be tagged with a label from a workspace the caller happens
    // to have a valid id for.
    const rows = await db
      .select({ id: label.id })
      .from(label)
      .where(and(eq(label.id, labelId), eq(label.orgId, context.organizationId)))
      .limit(1)

    if (!rows[0]) throw new NotFoundError('Label')

    if (attached) {
      await db.insert(cardLabel).values({ cardId, labelId }).onConflictDoNothing()
    } else {
      await db
        .delete(cardLabel)
        .where(and(eq(cardLabel.cardId, cardId), eq(cardLabel.labelId, labelId)))
    }

    await publish(context.boardId, {
      type: 'card.updated',
      boardId: context.boardId,
      cardId,
    })
    return null
  })
}

export async function listCardLabels(cardId: string): Promise<ActionResult<string[]>> {
  return actionResult(async () => {
    await requireCard(cardId, 'card:read')
    const rows = await getDb()
      .select({ labelId: cardLabel.labelId })
      .from(cardLabel)
      .where(eq(cardLabel.cardId, cardId))
    return rows.map((row) => row.labelId)
  })
}
