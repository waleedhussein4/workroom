import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/workroom',
  },
  // Migrations are reviewed as SQL before they run. `push` is for local
  // scratch work only.
  verbose: true,
  strict: true,
})
