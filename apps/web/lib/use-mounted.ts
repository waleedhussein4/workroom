'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

/**
 * True once hydrated, false during server render and the first client pass.
 *
 * `useSyncExternalStore` with differing server and client snapshots is the
 * hydration-safe way to ask this. The older pattern, a `useState(false)` plus
 * `useEffect(() => setMounted(true))`, causes a second render pass on every
 * mount for no reason.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
