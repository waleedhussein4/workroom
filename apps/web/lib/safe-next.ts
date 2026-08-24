const BACKSLASH = String.fromCharCode(92)

/**
 * Validates a post-sign-in redirect target.
 *
 * Anything that is not a plain in-app path is discarded. Without this, a link
 * like /sign-in?next=https://example.com turns the sign-in page into an open
 * redirect, which is a good way to make a phishing link look like it came from
 * this domain.
 *
 * Protocol-relative paths are rejected for the same reason: the browser reads
 * a leading double slash as absolute, so starting with "/" is not on its own
 * proof that a target is local. Backslashes go too, since some browsers
 * normalise them to forward slashes after the check would have passed.
 */
export function safeNext(value: string | null | undefined, fallback = '/workspaces'): string {
  if (!value) return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//')) return fallback
  if (value.includes(BACKSLASH)) return fallback
  return value
}
