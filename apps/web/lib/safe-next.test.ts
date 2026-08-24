import { describe, expect, it } from 'vitest'
import { safeNext } from './safe-next'

const BACKSLASH = String.fromCharCode(92)

describe('safeNext', () => {
  it('keeps ordinary in-app paths', () => {
    expect(safeNext('/workspaces')).toBe('/workspaces')
    expect(safeNext('/invitations/abc123')).toBe('/invitations/abc123')
    expect(safeNext('/w/acme/b/1?tab=x')).toBe('/w/acme/b/1?tab=x')
  })

  it('falls back when there is nothing to redirect to', () => {
    expect(safeNext(null)).toBe('/workspaces')
    expect(safeNext(undefined)).toBe('/workspaces')
    expect(safeNext('')).toBe('/workspaces')
  })

  it('rejects absolute urls', () => {
    // Otherwise the sign-in page becomes an open redirect, and a phishing link
    // inherits this domain's credibility.
    expect(safeNext('https://evil.example')).toBe('/workspaces')
    expect(safeNext('http://evil.example')).toBe('/workspaces')
    expect(safeNext('javascript:alert(1)')).toBe('/workspaces')
  })

  it('rejects protocol-relative paths', () => {
    // The browser reads //evil.example as absolute, so a leading slash is not
    // on its own proof that a target is local.
    expect(safeNext('//evil.example')).toBe('/workspaces')
    expect(safeNext('//evil.example/path')).toBe('/workspaces')
  })

  it('rejects backslashes, which some browsers normalise to slashes', () => {
    expect(safeNext('/' + BACKSLASH + 'evil.example')).toBe('/workspaces')
    expect(safeNext(BACKSLASH + BACKSLASH + 'evil.example')).toBe('/workspaces')
  })

  it('honours a custom fallback', () => {
    expect(safeNext(null, '/sign-in')).toBe('/sign-in')
  })
})
