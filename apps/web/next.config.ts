import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Next scaffolds editor rule files into the project on `next dev` unless
  // this is off. They are local tooling, not part of the application.
  agentRules: false,

  // The workspace packages ship TypeScript rather than a build output, so
  // Next has to compile them alongside the app.
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
