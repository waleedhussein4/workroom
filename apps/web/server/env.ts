/**
 * Environment access.
 *
 * Reads are deliberately lazy. Importing this module must not throw, because
 * `next build` imports every route and would fail on a machine that has no
 * runtime secrets, which includes CI.
 */

export function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local.`)
  return value
}

export function optional(name: string): string | undefined {
  return process.env[name] || undefined
}

export const isProduction = process.env.NODE_ENV === 'production'

/** GitHub sign-in is only offered when it has been configured. */
export function githubCredentials(): { clientId: string; clientSecret: string } | undefined {
  const clientId = optional('GITHUB_CLIENT_ID')
  const clientSecret = optional('GITHUB_CLIENT_SECRET')
  if (!clientId || !clientSecret) return undefined
  return { clientId, clientSecret }
}

/**
 * Whether new accounts have to confirm their email address.
 *
 * Requiring confirmation with no mail provider configured is not a safe
 * default, it is a locked door: the link goes to a server log and nobody
 * outside that log can finish signing up. So the requirement follows the
 * ability to send, and a deployment gains confirmation the moment it gains a
 * provider.
 *
 * The override wins in both directions. The end-to-end suite sets it to
 * "false", because the alternative is scraping a link out of server logs in
 * every sign-up test.
 */
export function emailVerificationRequired(
  override: string | undefined,
  canSendEmail: boolean,
): boolean {
  if (override === undefined) return canSendEmail
  return override !== 'false'
}
