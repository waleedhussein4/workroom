import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Vitest 4 renamed `workspace` to `projects`.
    projects: [
      {
        // Pure logic: ordering, permissions. No DOM, no DB, no framework.
        // This is the suite that proves the conflict-resolution guarantee.
        test: {
          name: 'logic',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts'],
        },
      },
    ],
  },
})
