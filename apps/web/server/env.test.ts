import { describe, expect, it } from 'vitest'
import { emailVerificationRequired } from './env'

describe('emailVerificationRequired', () => {
  it('follows the ability to send when nothing is set', () => {
    expect(emailVerificationRequired(undefined, true)).toBe(true)
    expect(emailVerificationRequired(undefined, false)).toBe(false)
  })

  it('does not lock people out of a deployment that cannot send email', () => {
    // The whole point. With no provider the confirmation link exists only in a
    // server log, so requiring it would mean nobody can finish signing up.
    expect(emailVerificationRequired(undefined, false)).toBe(false)
  })

  it('lets the override force it off even when email works', () => {
    // What the end-to-end suite sets.
    expect(emailVerificationRequired('false', true)).toBe(false)
  })

  it('lets the override force it on even when email does not work', () => {
    expect(emailVerificationRequired('true', false)).toBe(true)
  })

  it('treats any value other than "false" as on', () => {
    // An override is a deliberate act, so anything set but unrecognised is
    // read as the safer of the two rather than silently ignored.
    for (const value of ['1', 'yes', 'TRUE', 'off']) {
      expect(emailVerificationRequired(value, false)).toBe(true)
    }
  })
})
