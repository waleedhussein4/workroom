import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  comparePositioned,
  keyBetween,
  keysBetween,
  needsRebalance,
  rebalance,
  sortByPosition,
  toOrderKey,
  type OrderKey,
  type Positioned,
} from './ordering'

/** Deterministic bit source so jittered keys are reproducible under test. */
function seededRandomBit(seed: number): () => boolean {
  let state = seed >>> 0 || 1
  return () => {
    // xorshift32
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return (state & 1) === 1
  }
}

const NO_JITTER = { jitterBits: 0 } as const
const key = (s: string): OrderKey => toOrderKey(s)

describe('keyBetween', () => {
  it('produces a first key for an empty list', () => {
    expect(keyBetween(null, null, NO_JITTER)).toBe('a0')
  })

  it('appends after a lower bound', () => {
    expect(keyBetween(key('a0'), null, NO_JITTER)).toBe('a1')
  })

  it('prepends before an upper bound', () => {
    expect(keyBetween(null, key('a0'), NO_JITTER)).toBe('Zz')
  })

  it('lands strictly between two neighbours', () => {
    const mid = keyBetween(key('a0'), key('a1'), NO_JITTER)
    expect(mid > 'a0').toBe(true)
    expect(mid < 'a1').toBe(true)
  })

  it('rejects reversed bounds', () => {
    expect(() => keyBetween(key('a1'), key('a0'), NO_JITTER)).toThrow()
  })

  it('rejects equal bounds', () => {
    expect(() => keyBetween(key('a0'), key('a0'), NO_JITTER)).toThrow()
  })

  it('stays strictly between its bounds under repeated insertion', () => {
    let lo = keyBetween(null, null, NO_JITTER)
    const hi = keyBetween(lo, null, NO_JITTER)
    for (let i = 0; i < 200; i++) {
      const mid = keyBetween(lo, hi, NO_JITTER)
      expect(mid > lo).toBe(true)
      expect(mid < hi).toBe(true)
      lo = mid
    }
  })

  it('preserves intended order across randomised insertions', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 40 }), (insertAts) => {
        const items: { id: string; position: OrderKey }[] = []
        insertAts.forEach((raw, n) => {
          const at = Math.min(raw, items.length)
          const before = at > 0 ? (items[at - 1]?.position ?? null) : null
          const after = at < items.length ? (items[at]?.position ?? null) : null
          items.splice(at, 0, { id: `c${n}`, position: keyBetween(before, after, NO_JITTER) })
        })
        // Sorting by key must reproduce the insertion sequence exactly.
        expect(sortByPosition(items).map((i) => i.id)).toEqual(items.map((i) => i.id))
      }),
      { numRuns: 300 },
    )
  })
})

describe('key comparison', () => {
  it('sorts by byte order, not locale', () => {
    // The base-62 alphabet puts uppercase before lowercase. localeCompare
    // disagrees, and so would Postgres under a non-C collation.
    expect('A' < 'a').toBe(true)
    expect('A'.localeCompare('a')).toBeGreaterThan(0)

    const keys = ['a0', 'A0', 'Zz', 'z0', 'a0V']
    expect([...keys].sort()).toEqual([...keys].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)))
  })

  it('breaks ties on id', () => {
    const a: Positioned = { id: 'aaa', position: key('a0') }
    const b: Positioned = { id: 'bbb', position: key('a0') }
    expect(comparePositioned(a, b)).toBeLessThan(0)
    expect(comparePositioned(b, a)).toBeGreaterThan(0)
    expect(comparePositioned(a, a)).toBe(0)
  })
})

describe('concurrent moves into the same gap', () => {
  // Two clients drag different cards into the gap between a0 and a1 at the
  // same moment. Key generation is deterministic, so both compute the SAME
  // key. This is the scenario the ordering guarantee is about.
  const gapLo = key('a0')
  const gapHi = key('a1')

  const base: Positioned[] = [
    { id: 'card-anchor-lo', position: gapLo },
    { id: 'card-anchor-hi', position: gapHi },
  ]

  const moveX: Positioned = { id: 'card-x', position: keyBetween(gapLo, gapHi, NO_JITTER) }
  const moveY: Positioned = { id: 'card-y', position: keyBetween(gapLo, gapHi, NO_JITTER) }

  it('produces identical keys, confirming the collision is a certainty', () => {
    expect(moveX.position).toBe(moveY.position)
  })

  it('converges regardless of the order the moves are applied', () => {
    const applyXThenY = sortByPosition([...base, moveX, moveY])
    const applyYThenX = sortByPosition([...base, moveY, moveX])

    expect(applyXThenY.map((c) => c.id)).toEqual(applyYThenX.map((c) => c.id))
  })

  it('DIVERGES without the id tiebreak - do not remove it', () => {
    // Guard test. If someone simplifies comparePositioned down to a bare
    // position comparison, this is the bug they will have shipped: two
    // clients render the same data in different orders.
    const positionOnly = (a: Positioned, b: Positioned) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0

    const applyXThenY = [...base, moveX, moveY].sort(positionOnly).map((c) => c.id)
    const applyYThenX = [...base, moveY, moveX].sort(positionOnly).map((c) => c.id)

    expect(applyXThenY).not.toEqual(applyYThenX)
  })

  it('avoids the collision entirely when jitter is enabled', () => {
    const alice = keyBetween(gapLo, gapHi, { randomBit: seededRandomBit(1) })
    const bob = keyBetween(gapLo, gapHi, { randomBit: seededRandomBit(2) })

    expect(alice).not.toBe(bob)
    for (const k of [alice, bob]) {
      expect(k > gapLo).toBe(true)
      expect(k < gapHi).toBe(true)
    }
  })
})

describe('keysBetween', () => {
  it('returns nothing for n = 0', () => {
    expect(keysBetween(null, null, 0)).toEqual([])
  })

  it('returns n strictly increasing keys inside the bounds', () => {
    const keys = keysBetween(key('a0'), key('a1'), 10)
    expect(keys).toHaveLength(10)

    let previous: OrderKey | null = null
    for (const current of keys) {
      expect(current > 'a0').toBe(true)
      expect(current < 'a1').toBe(true)
      if (previous !== null) expect(previous < current).toBe(true)
      previous = current
    }
  })

  it('produces shorter keys than repeated single generation', () => {
    const bulk = keysBetween(key('a0'), key('a1'), 20)

    let lo = key('a0')
    const sequential: OrderKey[] = []
    for (let i = 0; i < 20; i++) {
      const next = keyBetween(lo, key('a1'), NO_JITTER)
      sequential.push(next)
      lo = next
    }

    const total = (ks: readonly OrderKey[]) => ks.reduce((sum, k) => sum + k.length, 0)
    expect(total(bulk)).toBeLessThan(total(sequential))
  })

  it('rejects a negative count', () => {
    expect(() => keysBetween(null, null, -1)).toThrow()
  })
})

describe('rebalance', () => {
  it('flags a column whose keys have grown too long', () => {
    const short: Positioned[] = [{ id: 'a', position: key('a0') }]
    expect(needsRebalance(short)).toBe(false)
    expect(needsRebalance(short, 1)).toBe(true)
  })

  it('preserves order exactly while shortening keys', () => {
    const items: Positioned[] = []
    const hi = keyBetween(null, null, NO_JITTER)
    let lo: OrderKey | null = null

    // Build a pathological column by always inserting into the same gap.
    for (let i = 0; i < 30; i++) {
      const next: OrderKey = keyBetween(lo, hi, NO_JITTER)
      items.push({ id: `c${i}`, position: next })
      lo = next
    }

    const before = sortByPosition(items).map((i) => i.id)
    const after = rebalance(items)

    expect(after.map((i) => i.id)).toEqual(before)
    expect(sortByPosition(after).map((i) => i.id)).toEqual(before)
    expect(needsRebalance(after)).toBe(false)
  })

  it('handles an empty column', () => {
    expect(rebalance([])).toEqual([])
  })
})
