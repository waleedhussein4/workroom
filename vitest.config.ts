import { defineConfig } from 'vitest/config'

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
        },
      },
      {
        // Server-side application logic. Still node, still no DOM.
        resolve: { tsconfigPaths: true },
        test: {
          name: 'server',
          environment: 'node',
          include: ['apps/web/server/**/*.test.ts', 'apps/web/lib/**/*.test.ts'],
        },
      },
    ],
  },
})
