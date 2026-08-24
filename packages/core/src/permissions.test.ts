import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  ForbiddenError,
  PERMISSIONS,
  ROLES,
  assertCan,
  can,
  canModifyComment,
  canRemoveMember,
  canSetRole,
  isReadOnly,
  isRole,
  type Action,
  type Role,
} from './permissions.js'

describe('the permission table', () => {
  it('covers every action for every role without gaps', () => {
    for (const action of ACTIONS) {
      for (const role of ROLES) {
        expect(typeof can(role, action)).toBe('boolean')
      }
    }
  })

  it('only ever grants known roles', () => {
    for (const [action, granted] of Object.entries(PERMISSIONS)) {
      for (const role of granted) {
        expect(ROLES, `${action} grants an unknown role`).toContain(role)
      }
    }
  })

  it('recognises exactly the four roles', () => {
    expect(ROLES).toEqual(['owner', 'admin', 'member', 'viewer'])
    expect(isRole('owner')).toBe(true)
    expect(isRole('superuser')).toBe(false)
    expect(isRole('')).toBe(false)
  })
})

describe('viewers', () => {
  const readActions: Action[] = [
    'workspace:read',
    'member:read',
    'board:read',
    'card:read',
    'doc:read',
    'comment:read',
  ]

  it('can read everything readable', () => {
    for (const action of readActions) {
      expect(can('viewer', action), action).toBe(true)
    }
  })

  it('can do nothing else at all', () => {
    const writeActions = ACTIONS.filter((a) => !readActions.includes(a))
    for (const action of writeActions) {
      expect(can('viewer', action), `viewer should not be able to ${action}`).toBe(false)
    }
  })

  it('is the only read-only role', () => {
    expect(isReadOnly('viewer')).toBe(true)
    for (const role of ROLES.filter((r) => r !== 'viewer')) {
      expect(isReadOnly(role)).toBe(false)
    }
  })
})

describe('owners', () => {
  it('can do everything', () => {
    for (const action of ACTIONS) {
      expect(can('owner', action), action).toBe(true)
    }
  })
})

describe('the deliberate exceptions', () => {
  // These four rows are the reason the table is written out in full rather
  // than derived from a role hierarchy.

  it('lets members update a board but not delete one', () => {
    expect(can('member', 'board:update')).toBe(true)
    expect(can('member', 'board:delete')).toBe(false)
  })

  it('does not let admins delete the workspace', () => {
    expect(can('admin', 'workspace:update')).toBe(true)
    expect(can('admin', 'workspace:delete')).toBe(false)
  })

  it('only lets owners change roles', () => {
    expect(can('owner', 'member:set-role')).toBe(true)
    expect(can('admin', 'member:set-role')).toBe(false)
  })

  it('does not let members moderate other people’s comments', () => {
    expect(can('member', 'comment:create')).toBe(true)
    expect(can('member', 'comment:moderate')).toBe(false)
  })
})

describe('assertCan', () => {
  it('passes silently when allowed', () => {
    expect(() => assertCan('owner', 'workspace:delete')).not.toThrow()
  })

  it('throws ForbiddenError carrying the role and action', () => {
    try {
      assertCan('viewer', 'card:update')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError)
      const forbidden = error as ForbiddenError
      expect(forbidden.role).toBe('viewer')
      expect(forbidden.action).toBe('card:update')
    }
  })
})

describe('comment ownership', () => {
  const author = 'user-author'
  const other = 'user-other'

  it('lets anyone who can comment edit their own', () => {
    for (const role of ['owner', 'admin', 'member'] as Role[]) {
      expect(canModifyComment(role, { actorId: author, authorId: author }), role).toBe(true)
    }
  })

  it('does not let a member touch somebody else’s', () => {
    expect(canModifyComment('member', { actorId: other, authorId: author })).toBe(false)
  })

  it('lets owners and admins moderate', () => {
    expect(canModifyComment('owner', { actorId: other, authorId: author })).toBe(true)
    expect(canModifyComment('admin', { actorId: other, authorId: author })).toBe(true)
  })

  it('does not let a viewer edit even their own comment', () => {
    // A viewer cannot have authored one, but the check should not depend on
    // that being true.
    expect(canModifyComment('viewer', { actorId: author, authorId: author })).toBe(false)
  })
})

describe('removing members', () => {
  it('lets owners remove anyone', () => {
    for (const target of ROLES) {
      expect(canRemoveMember('owner', target), target).toBe(true)
    }
  })

  it('does not let an admin remove an owner', () => {
    expect(canRemoveMember('admin', 'owner')).toBe(false)
  })

  it('does not let an admin remove another admin', () => {
    // Otherwise two admins can remove each other and it becomes a race.
    expect(canRemoveMember('admin', 'admin')).toBe(false)
  })

  it('lets an admin remove members and viewers', () => {
    expect(canRemoveMember('admin', 'member')).toBe(true)
    expect(canRemoveMember('admin', 'viewer')).toBe(true)
  })

  it('does not let members or viewers remove anyone', () => {
    for (const actor of ['member', 'viewer'] as Role[]) {
      for (const target of ROLES) {
        expect(canRemoveMember(actor, target), `${actor} -> ${target}`).toBe(false)
      }
    }
  })
})

describe('changing roles', () => {
  it('lets an owner set the non-owner roles', () => {
    for (const next of ['admin', 'member', 'viewer'] as Role[]) {
      expect(canSetRole('owner', next), next).toBe(true)
    }
  })

  it('does not let anyone promote to owner through a role change', () => {
    // Ownership transfer is its own operation, not a role edit.
    for (const actor of ROLES) {
      expect(canSetRole(actor, 'owner'), actor).toBe(false)
    }
  })

  it('does not let admins, members or viewers set roles', () => {
    for (const actor of ['admin', 'member', 'viewer'] as Role[]) {
      expect(canSetRole(actor, 'member'), actor).toBe(false)
    }
  })
})
