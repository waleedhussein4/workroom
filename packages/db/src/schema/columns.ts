import { customType } from 'drizzle-orm/pg-core'

/**
 * `text COLLATE "C"`, for fractional index keys.
 *
 * Order keys are case-sensitive and must compare byte by byte. Under a locale
 * collation Postgres sorts 'A' and 'a' by locale rules, which disagrees with
 * the client's comparison, and the board silently renders in a different order
 * on the server than in the browser. That bug looks exactly like the
 * concurrency bug the ordering design exists to prevent, so it is worth
 * pinning the collation at the column rather than relying on the database
 * being created with the right default.
 *
 * The local development database is deliberately created with the default
 * locale collation so that this is exercised rather than accidentally correct.
 */
export const orderKey = customType<{ data: string }>({
  dataType() {
    return 'text collate "C"'
  },
})

/**
 * `bytea`, mapped to Uint8Array in both directions.
 *
 * Yjs document state is raw bytes. Any layer that base64-encodes on one side
 * and not the other corrupts documents silently, so the round trip is covered
 * by a test.
 */
export const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value)
  },
  fromDriver(value: Buffer): Uint8Array {
    return new Uint8Array(value)
  },
})
