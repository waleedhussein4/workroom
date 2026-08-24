import { describe, expect, it } from 'vitest'
import { shouldReport } from './sentry-filter'

describe('shouldReport', () => {
  it('reports ordinary application errors', () => {
    expect(shouldReport('Cannot read properties of undefined')).toBe(true)
    expect(shouldReport('Unknown role "superuser" on member')).toBe(true)
    expect(shouldReport('duplicate key value violates unique constraint')).toBe(true)
  })

  it('reports errors with no message rather than dropping them silently', () => {
    expect(shouldReport(undefined)).toBe(true)
    expect(shouldReport(null)).toBe(true)
  })

  it('drops socket churn', () => {
    // Every deploy replaces the sync machine and disconnects everyone. That
    // is the design, not an incident.
    expect(shouldReport('WebSocket connection to wss://sync failed')).toBe(false)
    expect(shouldReport('socket hang up')).toBe(false)
    expect(shouldReport('read ECONNRESET')).toBe(false)
    expect(shouldReport('TypeError: Failed to fetch')).toBe(false)
  })

  it('drops requests the user abandoned', () => {
    expect(shouldReport('AbortError: The user aborted a request.')).toBe(false)
  })

  it("drops Next's control flow, which is thrown rather than returned", () => {
    expect(shouldReport('NEXT_REDIRECT')).toBe(false)
    expect(shouldReport('NEXT_NOT_FOUND')).toBe(false)
  })

  it('drops noise from browser extensions we cannot fix', () => {
    expect(shouldReport('ResizeObserver loop completed with undelivered notifications')).toBe(false)
    expect(shouldReport('Error in chrome-extension://abcdef/inject.js')).toBe(false)
  })
})
