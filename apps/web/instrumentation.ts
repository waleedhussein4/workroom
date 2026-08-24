import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

/**
 * Server-side request errors. Needs @sentry/nextjs 8.28 or newer and Next 15
 * or newer, and replaces the older manual try/catch reporting in route
 * handlers and server components.
 */
export const onRequestError = Sentry.captureRequestError
