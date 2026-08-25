import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema/index'

/**
 * The database client.
 *
 * The connection pool is created on first use rather than on import. That is
 * not an optimisation: `next build` imports every route to collect page data,
 * and the auth config builds its adapter at module scope, so an eager pool
 * makes the build itself require a live database configuration. Deferring it
 * means a build needs no secrets and a missing DATABASE_URL surfaces as a
 * clear error on the first query instead of a stack trace during compilation.
 */

function createPool(connectionString?: string): Pool {
  const url = connectionString ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
  }

  return new Pool({
    connectionString: url,
    // Small on purpose. Every serverless instance holds its own pool and the
    // sync server holds one too, so a large per-instance pool is how a managed
    // Postgres runs out of connections.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
}

function resolvePool(connectionString?: string): Pool {
  const globalRef = globalThis as typeof globalThis & { __workroomPool?: Pool }
  if (!connectionString && globalRef.__workroomPool) return globalRef.__workroomPool

  const pool = createPool(connectionString)
  // Cached across hot reloads in development, which would otherwise open a
  // fresh pool on every edit and exhaust the connection limit within minutes.
  if (!connectionString && process.env.NODE_ENV !== 'production') {
    globalRef.__workroomPool = pool
  }
  return pool
}

type DrizzleDb = ReturnType<typeof buildDb>

function buildDb(connectionString?: string) {
  return drizzle(resolvePool(connectionString), { schema, casing: 'snake_case' })
}

/**
 * Builds the client on first property access rather than on call.
 *
 * Deferring only the pool is not enough: Drizzle inspects the pool while
 * constructing the client, so the whole thing has to be lazy for `next build`
 * to import a route without a database configured.
 */
export function createDb(connectionString?: string): DrizzleDb {
  let real: DrizzleDb | undefined
  const resolve = (): DrizzleDb => (real ??= buildDb(connectionString))

  return new Proxy({} as DrizzleDb, {
    get(_target, property, receiver) {
      const db = resolve()
      const value = Reflect.get(db, property, receiver) as unknown
      return typeof value === 'function' ? (value as (...args: never[]) => unknown).bind(db) : value
    },
    has(_target, property) {
      return Reflect.has(resolve(), property)
    },
  })
}

export type Database = DrizzleDb

/**
 * An open transaction handle, as handed to `db.transaction(async (tx) => ...)`.
 *
 * Named so that logic operating inside a transaction can be written once and
 * called both by a server action and by a test that opens two transactions at
 * the same time.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

let cached: Database | undefined

/** The application database handle. */
export function getDb(): Database {
  cached ??= createDb()
  return cached
}

/**
 * Ends the pooled connections. Tests need this or the process hangs on an
 * open socket; the application never calls it.
 */
export async function closeDb(): Promise<void> {
  const globalRef = globalThis as typeof globalThis & { __workroomPool?: Pool }
  await globalRef.__workroomPool?.end()
  delete globalRef.__workroomPool
  cached = undefined
}
