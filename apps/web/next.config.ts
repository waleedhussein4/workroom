import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Next writes AGENTS.md and CLAUDE.md into the project on `next dev`
  // otherwise. They are editor tooling, not part of the application.
  agentRules: false,

  // Reached from the sync server and the browser, so it has to be a real
  // origin rather than a rewrite.
  transpilePackages: ['@workroom/core', '@workroom/db'],

  typedRoutes: true,
}

/**
 * Sentry wraps the config only when a DSN is present.
 *
 * Otherwise a fresh clone and every CI build would attempt source map upload
 * against a project that does not exist, and fail or warn for no reason.
 */
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Quiet locally, verbose in CI where the output is the only record.
      silent: !process.env.CI,
      // Routes Sentry's own requests through this origin, so an ad blocker
      // does not quietly discard the reports that matter most.
      tunnelRoute: '/monitoring',
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig
