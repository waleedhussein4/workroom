import { describe, expect, it } from 'vitest'
import { ACTIONS, PERMISSIONS, ROLES, can, type Role } from '@workroom/core'
import { accessStatement, grantsFor, organizationRoles, splitAction } from './access'

/**
 * Better Auth needs the resource vocabulary as a const literal, so it is
 * written out by hand in access.ts. These tests are what stop that hand-written
 * list drifting away from the permission table it is supposed to mirror.
 */

describe('the access statement mirrors the permission table', () => {
  it('declares every action the permission table defines', () => {
    for (const action of ACTIONS) {
      const { resource, verb } = splitAction(action)
      const verbs = (accessStatement as Record<string, readonly string[]>)[resource]
      expect(verbs, `no resource "${resource}" in the access statement`).toBeDefined()
      expect(verbs, `"${resource}" is missing the verb "${verb}"`).toContain(verb)
    }
  })

  it('declares no verbs the permission table does not define', () => {
    // The plugin contributes its own organization resources, so only the ones
    // this application owns are compared.
    const owned = new Set(ACTIONS.map((a) => splitAction(a).resource))
    const defined = new Set(ACTIONS)

    for (const [resource, verbs] of Object.entries(accessStatement)) {
      if (!owned.has(resource)) continue
      for (const verb of verbs as readonly string[]) {
        expect(defined, `"${resource}:${verb}" is declared but has no permission row`).toContain(
          `${resource}:${verb}`,
        )
      }
    }
  })
})

describe('derived role grants', () => {
  it('grants each role exactly what the permission table allows', () => {
    for (const role of ROLES) {
      const grants = grantsFor(role)
      for (const action of ACTIONS) {
        const { resource, verb } = splitAction(action)
        const granted = grants[resource]?.includes(verb) ?? false
        expect(granted, `${role} / ${action}`).toBe(can(role, action))
      }
    }
  })

  it('gives viewers no write verb anywhere', () => {
    const grants = grantsFor('viewer')
    for (const verbs of Object.values(grants)) {
      for (const verb of verbs) {
        expect(verb).toBe('read')
      }
    }
  })

  it('registers all four roles with the plugin', () => {
    expect(Object.keys(organizationRoles).sort()).toEqual([...ROLES].sort())
  })
})

describe('the permission table itself', () => {
  it('uses resource:verb throughout', () => {
    for (const action of ACTIONS) {
      expect(() => splitAction(action)).not.toThrow()
    }
  })

  it('grants nothing to an unknown role', () => {
    for (const granted of Object.values(PERMISSIONS)) {
      for (const role of granted as readonly Role[]) {
        expect(ROLES).toContain(role)
      }
    }
  })
})
