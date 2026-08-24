'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { and, eq } from 'drizzle-orm'
import { canRemoveMember, canSetRole, isRole, keysBetween, type Role } from '@workroom/core'
import { board, boardColumn, getDb, member, organization } from '@workroom/db'
import { auth } from '@/server/auth'
import { NotFoundError, requireUser, requireWorkspace, requireWorkspaceRole } from '@/server/guard'
import { actionResult, type ActionResult } from './result'

/** Slug from a workspace name, plus a short suffix if it is already taken. */
function toSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base.length >= 2 ? base : 'workspace'
}

async function uniqueSlug(name: string): Promise<string> {
  const db = getDb()
  const base = toSlug(name)
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const existing = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, candidate))
      .limit(1)
    if (existing.length === 0) return candidate
  }
  // Falls back to something certain to be free rather than looping forever.
  return `${base}-${Math.floor(Date.now() % 100000)}`
}

const DEFAULT_COLUMNS = ['Backlog', 'In progress', 'Done']

export async function createWorkspace(formData: FormData): Promise<ActionResult<{ slug: string }>> {
  return actionResult(async () => {
    const user = await requireUser()
    const name = String(formData.get('name') ?? '').trim()
    if (name.length < 2) throw new Error('Give the workspace a name.')
    if (name.length > 60) throw new Error('That name is too long.')

    const slug = await uniqueSlug(name)

    // Better Auth owns organization and membership rows, so creation goes
    // through its API rather than a direct insert. That also gives the creator
    // the owner role and sets the active organization on the session.
    const created = await auth.api.createOrganization({
      body: { name, slug, userId: user.id },
      headers: await headers(),
    })
    if (!created) throw new Error('Could not create the workspace.')

    // A brand new workspace with nothing in it is a bad first impression, so
    // seed one board with the three usual columns.
    const db = getDb()
    const [seeded] = await db
      .insert(board)
      .values({ orgId: created.id, name: 'First board', createdBy: user.id })
      .returning({ id: board.id })

    if (seeded) {
      const positions = keysBetween(null, null, DEFAULT_COLUMNS.length)
      await db.insert(boardColumn).values(
        DEFAULT_COLUMNS.map((columnName, index) => ({
          boardId: seeded.id,
          name: columnName,
          position: positions[index] as string,
        })),
      )
    }

    revalidatePath('/workspaces')
    return { slug }
  })
}

export async function renameWorkspace(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireWorkspaceRole(organizationId, 'workspace:update')
    const name = String(formData.get('name') ?? '').trim()
    if (name.length < 2) throw new Error('Give the workspace a name.')

    await getDb().update(organization).set({ name }).where(eq(organization.id, organizationId))

    revalidatePath(`/w/${context.slug}`)
    return null
  })
}

export async function inviteMember(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    await requireWorkspaceRole(organizationId, 'member:invite')

    const email = String(formData.get('email') ?? '')
      .trim()
      .toLowerCase()
    const role = String(formData.get('role') ?? 'member')

    if (!email.includes('@')) throw new Error('That does not look like an email address.')
    if (!isRole(role) || role === 'owner') throw new Error('Pick a valid role.')

    await auth.api.createInvitation({
      body: { email, role, organizationId },
      headers: await headers(),
    })

    return null
  })
}

export async function removeMember(
  organizationId: string,
  memberId: string,
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireWorkspaceRole(organizationId, 'member:remove')
    const db = getDb()

    const rows = await db
      .select({ role: member.role, userId: member.userId })
      .from(member)
      .where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)))
      .limit(1)

    const target = rows[0]
    if (!target) throw new NotFoundError('Member')
    if (!isRole(target.role)) throw new Error('That member has an unrecognised role.')

    // Seniority rule: an admin cannot remove an owner or another admin.
    if (!canRemoveMember(context.role, target.role)) {
      throw new Error('You cannot remove that member.')
    }
    if (target.userId === context.user.id) {
      throw new Error('Use "leave workspace" to remove yourself.')
    }
    await assertNotLastOwner(organizationId, target.role, memberId)

    await db.delete(member).where(eq(member.id, memberId))
    revalidatePath(`/w/${context.slug}/members`)
    return null
  })
}

export async function setMemberRole(
  organizationId: string,
  memberId: string,
  nextRole: string,
): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireWorkspaceRole(organizationId, 'member:set-role')
    if (!isRole(nextRole)) throw new Error('Unknown role.')
    if (!canSetRole(context.role, nextRole)) {
      throw new Error('Ownership is transferred separately, not through a role change.')
    }

    const db = getDb()
    const rows = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)))
      .limit(1)

    const target = rows[0]
    if (!target) throw new NotFoundError('Member')
    if (isRole(target.role)) await assertNotLastOwner(organizationId, target.role, memberId)

    await db.update(member).set({ role: nextRole }).where(eq(member.id, memberId))
    revalidatePath(`/w/${context.slug}/members`)
    return null
  })
}

/**
 * A workspace with no owner cannot be administered or deleted by anyone, so
 * the last one is not allowed to be demoted or removed.
 */
async function assertNotLastOwner(
  organizationId: string,
  targetRole: Role,
  memberId: string,
): Promise<void> {
  if (targetRole !== 'owner') return
  const owners = await getDb()
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.role, 'owner')))
  const remaining = owners.filter((row) => row.id !== memberId)
  if (remaining.length === 0) {
    throw new Error('A workspace needs at least one owner. Promote someone else first.')
  }
}

export async function leaveWorkspace(organizationId: string): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const context = await requireWorkspace(organizationId)
    const db = getDb()

    const rows = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, context.user.id)))
      .limit(1)

    const own = rows[0]
    if (!own) throw new NotFoundError('Membership')
    await assertNotLastOwner(organizationId, context.role, own.id)

    await db.delete(member).where(eq(member.id, own.id))
    revalidatePath('/workspaces')
    return null
  })
}
