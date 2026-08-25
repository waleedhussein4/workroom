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
