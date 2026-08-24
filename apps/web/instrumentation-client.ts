import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from './lib/sentry-init'

// Replaces sentry.client.config.ts, which @sentry/nextjs no longer reads.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    ...sentryOptions(),
    // Session replay is 50 a month on the free tier, so it is reserved for
    // sessions that actually went wrong.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
