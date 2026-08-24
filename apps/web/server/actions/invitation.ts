'use server'

import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { getDb, invitation, organization, user } from '@workroom/db'
import { auth } from '@/server/auth'
import { getSession } from '@/server/guard'
import { actionResult, type ActionResult } from './result'

/**
 * Invitation acceptance.
 *
 * Deliberately does not use Better Auth's `getInvitation` for the read.
 * That endpoint refuses unless the caller is signed in as the invited
 * address, which is correct for the mutation but useless for the page: a
 * signed-out visitor, or someone signed in as the wrong account, would get an
 * error instead of an explanation of what to do next. The read goes to the
 * database, and the accept goes through Better Auth so its own bookkeeping
 * happens.
 */

export type InvitationState =
  'ok' | 'not-found' | 'expired' | 'already-handled' | 'signed-out' | 'wrong-account'

export interface InvitationView {
  state: InvitationState
  id: string
  organizationName: string
  organizationSlug: string
  invitedEmail: string
  inviterName: string
  role: string
  /** The address the visitor is currently signed in as, if any. */
  currentEmail: string | null
}

export async function loadInvitation(invitationId: string): Promise<InvitationView | null> {
  const db = getDb()

  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      inviterName: user.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(user, eq(user.id, invitation.inviterId))
    .where(eq(invitation.id, invitationId))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const session = await getSession()
  const currentEmail = session?.email ?? null

  const base = {
    id: row.id,
    organizationName: row.organizationName,
    organizationSlug: row.organizationSlug,
    invitedEmail: row.email,
    inviterName: row.inviterName,
    role: row.role ?? 'member',
    currentEmail,
  }

  // Order matters. A visitor who is not signed in should be told to sign in
  // before being told the invitation expired, because signing in is the step
  // they can act on and the expiry may not even be theirs to worry about.
  if (row.status !== 'pending') return { ...base, state: 'already-handled' }
  if (row.expiresAt.getTime() < Date.now()) return { ...base, state: 'expired' }
  if (!currentEmail) return { ...base, state: 'signed-out' }
  if (currentEmail.toLowerCase() !== row.email.toLowerCase()) {
    return { ...base, state: 'wrong-account' }
  }

  return { ...base, state: 'ok' }
}

export async function acceptInvitation(
  invitationId: string,
): Promise<ActionResult<{ slug: string }>> {
  return actionResult(async () => {
    const view = await loadInvitation(invitationId)
    if (!view) throw new Error('That invitation no longer exists.')
    if (view.state === 'expired') throw new Error('That invitation has expired.')
    if (view.state === 'already-handled') {
      throw new Error('That invitation has already been used.')
    }
    if (view.state === 'signed-out') throw new Error('Sign in first.')
    if (view.state === 'wrong-account') {
      throw new Error(`That invitation is for ${view.invitedEmail}.`)
    }

    await auth.api.acceptInvitation({
      body: { invitationId },
      headers: await headers(),
    })

    return { slug: view.organizationSlug }
  })
}

export async function declineInvitation(invitationId: string): Promise<ActionResult<null>> {
  return actionResult(async () => {
    const view = await loadInvitation(invitationId)
    if (!view) throw new Error('That invitation no longer exists.')
    if (view.state === 'signed-out') throw new Error('Sign in first.')
    if (view.state === 'wrong-account') {
      throw new Error(`That invitation is for ${view.invitedEmail}.`)
    }

    await auth.api.rejectInvitation({
      body: { invitationId },
      headers: await headers(),
    })

    return null
  })
}
