/**
 * Which errors are worth a Sentry event.
 *
 * The free tier allows 5,000 errors a month. A realtime app generates network
 * noise continuously: sockets drop on suspend, on a tunnel change, on a deploy
 * replacing the sync machine. None of that is a bug, and a single reconnect
 * storm will spend a month's quota in an afternoon and then hide the one error
 * that mattered.
 *
 * Written as a pure predicate so it can be tested without a Sentry client.
 */

const IGNORED_PATTERNS = [
  // Socket churn. Expected on suspend, network change, and every deploy.
  /websocket/i,
  /socket hang up/i,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /network ?error/i,
  /Failed to fetch/i,
  /Load failed/i,
  /NetworkError when attempting to fetch/i,

  // Navigating away mid-request. The user's decision, not a fault.
  /AbortError/,
  /The user aborted a request/i,
  /cancelled|canceled/i,

  // Next's own control flow, which is thrown rather than returned.
  /NEXT_REDIRECT/,
  /NEXT_NOT_FOUND/,

  // Browser extensions and injected scripts, which we cannot fix.
  /ResizeObserver loop/i,
  /chrome-extension:/,
  /moz-extension:/,
]

export function shouldReport(message: string | undefined | null): boolean {
  if (!message) return true
  return !IGNORED_PATTERNS.some((pattern) => pattern.test(message))
}
