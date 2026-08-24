import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  // Every test creates its own workspace and board, so nothing is shared and
  // full parallelism is safe.
  fullyParallel: true,
  forbidOnly: isCI,
  workers: isCI ? 2 : undefined,

  /**
   * 'isolated' re-runs a failed test on its own rather than blindly repeating
   * it in place. That distinguishes a genuinely flaky test from one that only
   * fails when something else is running, which matters here because half the
   * suite is about concurrency.
   */
  retries: isCI ? 2 : 0,

  reporter: isCI ? [['blob'], ['github']] : [['html', { open: 'never' }], ['list']],

  /**
   * A run against a deployed environment pays real network latency on every
   * navigation, and the collaboration tests do a lot of them. 30 seconds is
   * comfortable locally and not remotely.
   */
  timeout: process.env.E2E_BASE_URL ? 90_000 : 30_000,

  use: {
    baseURL,
    trace: 'on-first-retry',
    video: isCI ? 'retain-on-failure' : 'off',
  },

  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'npm run start --workspace @workroom/sync',
          url: 'http://127.0.0.1:1234/health',
          reuseExistingServer: !isCI,
          timeout: 60_000,
          env: {
            PORT: '1234',
            DATABASE_URL: process.env.DATABASE_URL ?? '',
            REALTIME_JWT_SECRET: process.env.REALTIME_JWT_SECRET ?? 'e2e-realtime-secret',
            SYNC_INTERNAL_SECRET: process.env.SYNC_INTERNAL_SECRET ?? 'e2e-internal-secret',
          },
        },
        {
          command: 'npm run start --workspace @workroom/web -- --port 3100',
          url: baseURL,
          reuseExistingServer: !isCI,
          timeout: 120_000,
          env: {
            PORT: '3100',
            DATABASE_URL: process.env.DATABASE_URL ?? '',
            BETTER_AUTH_SECRET:
              process.env.BETTER_AUTH_SECRET ?? 'e2e-only-secret-long-enough-to-satisfy-checks',
            // Confirming an address means scraping a link out of server logs
            // in every sign-up test. Turned off here and nowhere else.
            AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
            BETTER_AUTH_URL: baseURL,
            REALTIME_JWT_SECRET: process.env.REALTIME_JWT_SECRET ?? 'e2e-realtime-secret',
            SYNC_INTERNAL_SECRET: process.env.SYNC_INTERNAL_SECRET ?? 'e2e-internal-secret',
            SYNC_INTERNAL_URL: 'http://127.0.0.1:1234',
            NEXT_PUBLIC_SYNC_URL: 'ws://127.0.0.1:1234',
          },
        },
      ],
})
