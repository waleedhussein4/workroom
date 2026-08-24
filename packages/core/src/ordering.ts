/**
 * Card and column ordering.
 *
 * Board order is stored in Postgres as an opaque, lexicographically-sortable
 * string per row (a "fractional index"). Moving a card writes exactly one row,
 * which is the smallest possible surface for two concurrent writers to collide
 * on. The "Ordering" section of docs/SPEC.md has the full rationale.
 *
 * Three layers defend the ordering guarantee. All three are required:
 *
 *   1. A total order. `generateKeyBetween` is deterministic, so two clients
 *      dropping cards into the same gap compute the *same* key -- a certainty,
 *      not a probability. `ORDER BY position` alone is then underdetermined and
 *      different clients can render different orders. Sorting by
 *      (position, id) makes ties harmless: every client converges on the same
 *      sequence. This is the actual fix.
 *   2. Server-assigned keys. The move API takes neighbour ids, and the server
 *      re-reads their keys inside the transaction. Lives in the data layer.
 *   3. Jitter. Makes identical keys rare rather than certain. Cheap insurance
 *      on top of (1), never a substitute for it.
 */

import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

/**
 * A fractional index. Branded so a uuid or a stringified number cannot be
 * assigned into a `position` field by accident.
 */
export type OrderKey = string & { readonly __orderKey: unique symbol }

/** Anything that carries a position and a stable id. */
export interface Positioned {
  readonly id: string
  readonly position: OrderKey
}

/** Returns a random bit. Injected so jitter is deterministic under test. */
export type RandomBit = () => boolean

const defaultRandomBit: RandomBit = () => Math.random() < 0.5

/**
 * Number of times to bisect the remaining key space when jittering.
 * 30 bits puts the collision probability for concurrent actors around 1 in
 * 47,000, costing a handful of extra characters per key.
 */
export const DEFAULT_JITTER_BITS = 30

/**
 * Keys longer than this in a single column trigger a rebalance. Reaching it
 * requires pathological repeated insertion into one gap; the watchdog exists
 * so that case degrades gracefully instead of growing without bound.
 */
export const REBALANCE_KEY_LENGTH = 64

/** Narrowing assertion for values arriving from the database or the network. */
export function isOrderKey(value: string): value is OrderKey {
  if (value.length === 0) return false
  try {
    // generateKeyBetween validates canonical form and throws otherwise.
    generateKeyBetween(value, null)
    return true
  } catch {
    return false
  }
}

/** Casts a validated string to an OrderKey, throwing if it is not canonical. */
export function toOrderKey(value: string): OrderKey {
  if (!isOrderKey(value)) {
    throw new Error(`Not a canonical order key: ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Total order over positioned rows.
 *
 * Compares `position` by UTF-16 code unit, which for the base-62 key alphabet
 * is byte order -- deliberately NOT `localeCompare`, which would sort 'A' and
 * 'a' by locale rules and disagree with Postgres under `COLLATE "C"`.
 *
 * The `id` tiebreak is what makes duplicate keys converge rather than corrupt.
 * Removing it reintroduces the exact bug this module exists to prevent.
 */
export function comparePositioned(a: Positioned, b: Positioned): number {
  if (a.position < b.position) return -1
  if (a.position > b.position) return 1
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/** Returns a new array sorted by (position, id). Does not mutate the input. */
export function sortByPosition<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort(comparePositioned)
}

/**
 * Generates a key strictly between `before` and `after`.
 *
 * `null` means "no neighbour on that side": `keyBetween(null, null)` is the
 * first key in an empty list, `keyBetween(last, null)` appends.
 *
 * Jitter works by repeatedly bisecting the remaining range, choosing a side at
 * random each time, so two callers looking at the same gap almost certainly
 * land on different keys.
 *
 * @throws if `before >= after`.
 */
export function keyBetween(
  before: OrderKey | null,
  after: OrderKey | null,
  options: { jitterBits?: number; randomBit?: RandomBit } = {},
): OrderKey {
  const { jitterBits = DEFAULT_JITTER_BITS, randomBit = defaultRandomBit } = options

  if (before !== null && after !== null && before >= after) {
    throw new Error(
      `keyBetween requires before < after, received ${JSON.stringify(before)} and ${JSON.stringify(after)}`,
    )
  }

  let lo = before
  let hi = after
  let key = generateKeyBetween(lo, hi) as OrderKey

  for (let i = 0; i < jitterBits; i++) {
    if (randomBit()) lo = key
    else hi = key
    key = generateKeyBetween(lo, hi) as OrderKey
  }

  return key
}

/**
 * Generates `n` evenly-spaced keys between two bounds.
 *
 * Produces shorter keys than calling `keyBetween` n times, so this is the right
 * tool for seeding a column and for rebalancing. Not jittered: callers are
 * writing a contiguous run they already own.
 */
export function keysBetween(
  before: OrderKey | null,
  after: OrderKey | null,
  n: number,
): OrderKey[] {
  if (n < 0) throw new Error(`keysBetween requires n >= 0, received ${n}`)
  if (n === 0) return []
  return generateNKeysBetween(before, after, n) as OrderKey[]
}

/** True when a column's keys have grown long enough to warrant a rebalance. */
export function needsRebalance(
  items: readonly Positioned[],
  maxKeyLength = REBALANCE_KEY_LENGTH,
): boolean {
  return items.some((item) => item.position.length > maxKeyLength)
}

/**
 * Reassigns short, evenly-spaced keys to a column while preserving its exact
 * current order. Returns one entry per item, in sorted order.
 *
 * Callers must not run this while a drag is in flight on the column: it
 * rewrites every row and will fight optimistic client state.
 */
export function rebalance(items: readonly Positioned[]): { id: string; position: OrderKey }[] {
  const sorted = sortByPosition(items)
  const keys = keysBetween(null, null, sorted.length)
  return sorted.map((item, i) => ({
    id: item.id,
    // `keys` has exactly `sorted.length` entries, so this index is always populated.
    position: keys[i] as OrderKey,
  }))
}
