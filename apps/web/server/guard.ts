import 'server-only'

import { cache } from 'react'
import { headers } from 'next/headers'
import { and, eq } from 'drizzle-orm'
import { ForbiddenError, assertCan, isRole, type Action, type Role } from '@workroom/core'
import { board, card, comment, document, getDb, member, organization } from '@workroom/db'
import { auth } from './auth'

/**
 * The authorization layer.
 *
 * Every mutation and every page that reads workspace data goes through one of
 * these. Nothing relies on proxy.ts or middleware for access control: a
 * middleware check protects a URL, and a Server Action is reachable without
 * ever visiting one.
 *
 * The shape is always the same. Resolve the session, resolve the resource to
 * the workspace that owns it, look up the caller's membership in that
 * workspace, then check the action against the role. A caller with no
 * membership row is indistinguishable from a caller asking about a resource
 * that does not exist, which is deliberate: both raise NotFoundError, so
 * workspace ids cannot be probed for existence.
 */

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not signed in')
    this.name = 'UnauthenticatedError'
  }
}

/**
 * Raised both when a resource does not exist and when the caller is not a
 * member of the workspace that owns it. Keeping the two indistinguishable is
 * what stops workspace and board ids being probed for existence.
 */
export class NotFoundError extends Error {
  constructor(what = 'Resource') {
    super(`${what} not found`)
    this.name = 'NotFoundError'
  }
}

export { ForbiddenError }

export interface SessionUser {
  id: string
  name: string
  email: string
  image: string | null
  emailVerified: boolean
}

/**
 * Reads the session once per request.
 *
 * `cache` dedupes this across a render, so a layout and three nested server
 * components asking for the session cost one lookup rather than four.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() })
  if (!result?.user) return null
  const { id, name, email, image, emailVerified } = result.user
  return { id, name, email, image: image ?? null, emailVerified: Boolean(emailVerified) }
})

/** The signed-in user, or `UnauthenticatedError`. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession()
  if (!user) throw new UnauthenticatedError()
  return user
}

export interface WorkspaceContext {
  user: SessionUser
  organizationId: string
  slug: string
  name: string
  role: Role
}

/**
 * Resolves the caller's membership of a workspace by id.
 *
 * Returns null rather than throwing so callers can decide between "not found"
 * and "redirect to sign in".
 */
const loadMembership = cache(
  async (userId: string, organizationId: string): Promise<WorkspaceContext | null> => {
    const db = getDb()
    const rows = await db
      .select({
        role: member.role,
        organizationId: organization.id,
        slug: organization.slug,
        name: organization.name,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
      .limit(1)

    const row = rows[0]
    if (!row) return null
    if (!isRole(row.role)) {
      // A role string the application does not understand must not be treated
      // as a permissive default.
      throw new Error(`Unknown role "${row.role}" on member ${userId}/${organizationId}`)
    }
    return {
      user: { id: userId, name: '', email: '', image: null, emailVerified: true },
      organizationId: row.organizationId,
      slug: row.slug,
      name: row.name,
      role: row.role,
    }
  },
)

const resolveSlug = cache(async (slug: string): Promise<string | null> => {
  const db = getDb()
  const rows = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1)
  return rows[0]?.id ?? null
})

/** Membership of a workspace addressed by id. Throws if there is none. */
export async function requireWorkspace(organizationId: string): Promise<WorkspaceContext> {
  const user = await requireUser()
  const context = await loadMembership(user.id, organizationId)
  if (!context) throw new NotFoundError('Workspace')
  return { ...context, user }
}

/** Membership of a workspace addressed by slug, which is what URLs carry. */
export async function requireWorkspaceBySlug(slug: string): Promise<WorkspaceContext> {
  const user = await requireUser()
  const organizationId = await resolveSlug(slug)
  // Same error whether the workspace does not exist or the caller is simply
  // not in it.
  if (!organizationId) throw new NotFoundError('Workspace')
  const context = await loadMembership(user.id, organizationId)
  if (!context) throw new NotFoundError('Workspace')
  return { ...context, user }
}

/** Membership plus a permission check. This is the usual entry point. */
export async function requireWorkspaceRole(
  organizationId: string,
  action: Action,
): Promise<WorkspaceContext> {
  const context = await requireWorkspace(organizationId)
  assertCan(context.role, action)
  return context
}

/** As `requireWorkspaceRole`, for the slug that URLs carry. */
export async function requireWorkspaceRoleBySlug(
  slug: string,
  action: Action,
): Promise<WorkspaceContext> {
  const context = await requireWorkspaceBySlug(slug)
  assertCan(context.role, action)
  return context
}

/**
 * Resource-scoped checks.
 *
 * Each resolves the resource to its owning workspace before checking, so a
 * board id from another workspace fails the membership lookup rather than
 * quietly passing a permission check against the wrong workspace.
 */

export async function requireBoard(boardId: string, action: Action) {
  const db = getDb()
  const rows = await db
    .select({ orgId: board.orgId, name: board.name })
    .from(board)
    .where(eq(board.id, boardId))
    .limit(1)
  const row = rows[0]
  if (!row) throw new NotFoundError('Board')
  const context = await requireWorkspaceRole(row.orgId, action)
  return { ...context, boardId, boardName: row.name }
}

export async function requireCard(cardId: string, action: Action) {
  const db = getDb()
  const rows = await db
    .select({ orgId: board.orgId, boardId: card.boardId, columnId: card.columnId })
    .from(card)
    .innerJoin(board, eq(board.id, card.boardId))
    .where(eq(card.id, cardId))
    .limit(1)
  const row = rows[0]
  if (!row) throw new NotFoundError('Card')
  const context = await requireWorkspaceRole(row.orgId, action)
  return { ...context, cardId, boardId: row.boardId, columnId: row.columnId }
}

export async function requireDocument(documentId: string, action: Action) {
  const db = getDb()
  const rows = await db
    .select({ orgId: document.orgId, title: document.title })
    .from(document)
    .where(eq(document.id, documentId))
    .limit(1)
  const row = rows[0]
  if (!row) throw new NotFoundError('Document')
  const context = await requireWorkspaceRole(row.orgId, action)
  return { ...context, documentId, title: row.title }
}

export async function requireComment(commentId: string, action: Action) {
  const db = getDb()
  const rows = await db
    .select({ orgId: board.orgId, authorId: comment.authorId, cardId: comment.cardId })
    .from(comment)
    .innerJoin(card, eq(card.id, comment.cardId))
    .innerJoin(board, eq(board.id, card.boardId))
    .where(eq(comment.id, commentId))
    .limit(1)
  const row = rows[0]
  if (!row) throw new NotFoundError('Comment')
  const context = await requireWorkspaceRole(row.orgId, action)
  return { ...context, commentId, authorId: row.authorId, cardId: row.cardId }
}

/** Every workspace the caller belongs to, for the switcher and the index. */
export async function listWorkspaces(userId: string) {
  const db = getDb()
  return db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(organization.name)
}
