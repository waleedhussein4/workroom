import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements } from 'better-auth/plugins/organization/access'
import { ACTIONS, PERMISSIONS, ROLES, type Role } from '@workroom/core'

/**
 * Better Auth access control.
 *
 * The organization plugin has to know the role names, otherwise it rejects
 * "viewer" as unknown when inviting somebody, and it has to know the
 * vocabulary of resources and verbs.
 *
 * The vocabulary is written out literally below because Better Auth's types
 * need a const literal to infer against. What is *not* duplicated is the
 * policy: which role gets which verb is derived from `PERMISSIONS` in
 * packages/core, so there is still one place that decides who can do what.
 * `access.test.ts` asserts the vocabulary and the permission table describe
 * exactly the same set of actions, so the two cannot drift.
 *
 * Application code checks authorization with `can()` directly. This exists so
 * the plugin's own invitation and role-update endpoints agree with it.
 */

const statement = {
  ...defaultStatements,
  workspace: ['read', 'update', 'delete'],
  member: ['read', 'invite', 'remove', 'set-role'],
  board: ['create', 'read', 'update', 'delete'],
  column: ['create', 'update', 'delete'],
  card: ['create', 'read', 'update', 'delete'],
  doc: ['create', 'read', 'update', 'delete'],
  comment: ['create', 'read', 'moderate'],
  label: ['manage'],
} as const

export const ac = createAccessControl(statement)

type Statement = typeof statement
type Grants = { [K in keyof Statement]?: Statement[K][number][] }

/** Splits `"card:update"` into its resource and verb. Throws on anything else. */
export function splitAction(action: string): { resource: string; verb: string } {
  const index = action.indexOf(':')
  if (index === -1) throw new Error(`Action "${action}" is not "resource:verb"`)
  return { resource: action.slice(0, index), verb: action.slice(index + 1) }
}

/** The verbs a role is granted, grouped by resource, read off PERMISSIONS. */
export function grantsFor(role: Role): Record<string, string[]> {
  const grants: Record<string, string[]> = {}
  for (const action of ACTIONS) {
    if (!(PERMISSIONS[action] as readonly Role[]).includes(role)) continue
    const { resource, verb } = splitAction(action)
    ;(grants[resource] ??= []).push(verb)
  }
  return grants
}

/**
 * Owners and admins also receive the plugin's own organization statements so
 * its built-in endpoints work. Members and viewers deliberately do not.
 */
function pluginGrantsFor(role: Role): Record<string, string[]> {
  if (role !== 'owner' && role !== 'admin') return {}
  return Object.fromEntries(
    Object.entries(defaultStatements).map(([resource, verbs]) => [resource, [...verbs]]),
  )
}

function roleFor(role: Role) {
  const grants = { ...pluginGrantsFor(role), ...grantsFor(role) }
  // One contained cast. The runtime shape is checked by access.test.ts.
  return ac.newRole(grants as Grants)
}

export const owner = roleFor('owner')
export const admin = roleFor('admin')
export const member = roleFor('member')
export const viewer = roleFor('viewer')

/**
 * The four roles as Better Auth access-control objects, which is the shape
 * the organization plugin wants. `PERMISSIONS` in packages/core stays the
 * single source of truth; these are derived from it, and access.test.ts
 * fails if the two drift apart.
 */
export const organizationRoles: Record<Role, ReturnType<typeof roleFor>> = {
  owner,
  admin,
  member,
  viewer,
}

/** Exported for the drift test. */
export const accessStatement = statement
export const allRoles = ROLES
