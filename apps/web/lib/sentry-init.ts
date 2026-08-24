import type { init as sentryInit } from '@sentry/nextjs'
import { shouldReport } from './sentry-filter'

/**
 * Shared Sentry options.
 *
 * Sentry stays entirely off when no DSN is set, so a fresh clone and every CI
 * run behave exactly as they did before it was added, rather than silently
 * failing to reach a project that does not exist.
 */
export const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)

export function sentryOptions(): Parameters<typeof sentryInit>[0] {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

    // Traces are not the constraint the free tier is tight on, but there is
    // no reason to spend them at full rate either.
    tracesSampleRate: 0.1,

    // Nothing on the client is worth sending to a third party by default.
    // Names, card titles and document text are all user content.
    sendDefaultPii: false,

    beforeSend(event) {
      const message = event.exception?.values?.[0]?.value ?? event.message
      return shouldReport(message) ? event : null
    },
  }
}
