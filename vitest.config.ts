import { defineConfig } from 'vitest/config'

// Integration tests open real connections and are opted into by name, so the
// two fast projects exclude them explicitly rather than by directory.
const INTEGRATION = '**/*.integration.test.ts'

export default defineConfig({
  test: {
    // Vitest 4 renamed `workspace` to `projects`.
    projects: [
      {
        // Pure logic: ordering, permissions. No DOM, no database, no
        // framework. This is the suite that proves the ordering guarantee.
        test: {
          name: 'logic',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts'],
          exclude: [INTEGRATION],
        },
      },
      {
        // Server-side application logic. Still node, still no DOM.
        resolve: { tsconfigPaths: true },
        test: {
          name: 'server',
          environment: 'node',
          include: ['apps/web/server/**/*.test.ts', 'apps/web/lib/**/*.test.ts'],
          exclude: [INTEGRATION],
        },
      },
      {
        // Needs a real Postgres. Every file here skips itself when
        // DATABASE_URL is unset, so running this project on a fresh clone
        // reports zero tests rather than a wall of connection errors.
        resolve: { tsconfigPaths: true },
        test: {
          name: 'integration',
          environment: 'node',
          include: [INTEGRATION],
          // Two transactions racing for the same rows is the point. Running
          // files in parallel against one database would add a second,
          // uncontrolled race on top of it.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
