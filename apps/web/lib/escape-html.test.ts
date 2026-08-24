import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape-html'

describe('escapeHtml', () => {
  it('leaves ordinary text alone', () => {
    expect(escapeHtml('Alice Ashwood')).toBe('Alice Ashwood')
    expect(escapeHtml('Acme Labs')).toBe('Acme Labs')
  })

  it('escapes the characters that end a tag or an attribute', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    expect(escapeHtml('a "quoted" value')).toBe('a &quot;quoted&quot; value')
    expect(escapeHtml("it's")).toBe('it&#39;s')
  })

  it('escapes the ampersand before the escapes it produces', () => {
    // Replacing < first would turn "&" into "&amp;" a second time and render
    // as "&amp;lt;" rather than "<".
    expect(escapeHtml('&<')).toBe('&amp;&lt;')
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  it('neutralises a name chosen to break out of an attribute', () => {
    // A workspace name goes into an email as text and a user picks it.
    const hostile = '" onmouseover="alert(1)'
    expect(escapeHtml(hostile)).not.toContain('"')
    expect(escapeHtml(hostile)).toBe('&quot; onmouseover=&quot;alert(1)')
  })

  it('handles an empty string', () => {
    expect(escapeHtml('')).toBe('')
  })
})
