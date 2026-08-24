/**
 * Workspace authorization.
 *
 * Everything here is a pure function over plain data. No database, no request,
 * no session. That is deliberate: the entire policy can be table-tested in
 * milliseconds, and the server code that calls it stays a thin lookup of
 * "which role does this user have in this workspace" followed by a `can` check.
 *
 * The rule this encodes: hiding a control in the UI is a convenience. The
 * check that matters happens on the server, on every mutation.
 */

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const

export type Role = (typeof ROLES)[number]

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

/**
 * Seniority, used for rules that compare two people rather than checking a
 * capability. Higher outranks lower.
 */
const RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  viewer: 0,
}

/**
 * Which roles may perform each action.
 *
 * Written out in full rather than derived from role hierarchy. Hierarchies
 * read well until the first exception, and there are already two here:
 * members can update a board but not delete one, and admins cannot remove
 * owners. Explicit rows make those visible instead of hidden in an override.
 */
export const PERMISSIONS = {
  'workspace:read': ['owner', 'admin', 'member', 'viewer'],
  'workspace:update': ['owner', 'admin'],
  'workspace:delete': ['owner'],

  'member:read': ['owner', 'admin', 'member', 'viewer'],
  'member:invite': ['owner', 'admin'],
  'member:remove': ['owner', 'admin'],
  'member:set-role': ['owner'],

  'board:create': ['owner', 'admin', 'member'],
  'board:read': ['owner', 'admin', 'member', 'viewer'],
  'board:update': ['owner', 'admin', 'member'],
  'board:delete': ['owner', 'admin'],

  'column:create': ['owner', 'admin', 'member'],
  'column:update': ['owner', 'admin', 'member'],
  'column:delete': ['owner', 'admin', 'member'],

  'card:create': ['owner', 'admin', 'member'],
  'card:read': ['owner', 'admin', 'member', 'viewer'],
  'card:update': ['owner', 'admin', 'member'],
  'card:delete': ['owner', 'admin', 'member'],

  'doc:create': ['owner', 'admin', 'member'],
  'doc:read': ['owner', 'admin', 'member', 'viewer'],
  'doc:update': ['owner', 'admin', 'member'],
  'doc:delete': ['owner', 'admin', 'member'],

  'comment:create': ['owner', 'admin', 'member'],
  'comment:read': ['owner', 'admin', 'member', 'viewer'],
  /** Editing or deleting somebody else's comment. Your own is always allowed. */
  'comment:moderate': ['owner', 'admin'],

  'label:manage': ['owner', 'admin', 'member'],
} as const satisfies Record<string, readonly Role[]>

export type Action = keyof typeof PERMISSIONS

export const ACTIONS = Object.keys(PERMISSIONS) as Action[]

/** True when `role` may perform `action`. */
export function can(role: Role, action: Action): boolean {
  return (PERMISSIONS[action] as readonly Role[]).includes(role)
}

/** Thrown when an authorization check fails. Carries no detail by design. */
export class ForbiddenError extends Error {
  readonly action: Action
  readonly role: Role

  constructor(role: Role, action: Action) {
    super(`Role "${role}" may not perform "${action}"`)
    this.name = 'ForbiddenError'
    this.role = role
    this.action = action
  }
}

/** `can`, but throws. Use at the top of a mutation. */
export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) throw new ForbiddenError(role, action)
}

/**
 * Whether `actor` may edit or delete a comment.
 *
 * Anyone who can comment may edit their own. Editing somebody else's needs
 * the moderate permission.
 */
export function canModifyComment(
  role: Role,
  { actorId, authorId }: { actorId: string; authorId: string },
): boolean {
  if (actorId === authorId) return can(role, 'comment:create')
  return can(role, 'comment:moderate')
}

/**
 * Whether `actorRole` may remove a member holding `targetRole`.
 *
 * Admins can remove members and viewers but not owners or each other, so that
 * an admin cannot unilaterally take over a workspace. Owners can remove
 * anyone except the last owner, which is a database-level concern and checked
 * separately.
 */
export function canRemoveMember(actorRole: Role, targetRole: Role): boolean {
  if (!can(actorRole, 'member:remove')) return false
  if (actorRole === 'owner') return true
  return RANK[targetRole] < RANK[actorRole]
}

/**
 * Whether `actorRole` may change somebody's role to `nextRole`.
 *
 * Only owners can, and they cannot promote anyone to owner. Transferring
 * ownership is a separate, deliberate operation rather than a role edit.
 */
export function canSetRole(actorRole: Role, nextRole: Role): boolean {
  if (!can(actorRole, 'member:set-role')) return false
  return nextRole !== 'owner'
}

/** True when the role can change anything at all. Handy for read-only UI. */
export function isReadOnly(role: Role): boolean {
  return role === 'viewer'
}
