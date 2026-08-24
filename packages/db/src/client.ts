import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema/index'

let pool: Pool | undefined

/**
 * Shared connection pool.
 *
 * Kept on globalThis in development so Next's hot reload does not open a new
 * pool on every edit and exhaust the server's connection limit within a few
 * minutes of work.
 */
function getPool(): Pool {
  const globalRef = globalThis as typeof globalThis & { __workroomPool?: Pool }
  if (globalRef.__workroomPool) return globalRef.__workroomPool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example and fill it in.')
  }

  const created = new Pool({
    connectionString,
    // Small on purpose. Serverless functions each hold their own pool, and the
    // sync server holds one too, so a large per-instance pool is how you run
    // out of connections on a managed Postgres.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })

  if (process.env.NODE_ENV !== 'production') globalRef.__workroomPool = created
  pool = created
  return created
}

export function createDb(connectionString?: string) {
  if (connectionString) {
    return drizzle(new Pool({ connectionString, max: 5 }), { schema, casing: 'snake_case' })
  }
  return drizzle(getPool(), { schema, casing: 'snake_case' })
}

export type Database = ReturnType<typeof createDb>

let cached: Database | undefined

/** The application database handle. */
export function getDb(): Database {
  cached ??= createDb()
  return cached
}

export async function closeDb(): Promise<void> {
  await pool?.end()
  pool = undefined
  cached = undefined
  delete (globalThis as typeof globalThis & { __workroomPool?: Pool }).__workroomPool
}
