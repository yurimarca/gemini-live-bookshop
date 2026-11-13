import { useSyncExternalStore } from 'react'

/** A very small external store: enough for this app, and trivially testable without React. */
export interface Store<S> {
  get(): S
  set(next: S | ((prev: S) => S)): void
  subscribe(listener: () => void): () => void
}

export function createStore<S>(initial: S): Store<S> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (prev: S) => S)(state) : next
      if (Object.is(value, state)) return
      state = value
      listeners.forEach((l) => l())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<S>(store: Store<S>): S
export function useStore<S, T>(store: Store<S>, select: (s: S) => T): T
export function useStore<S, T>(store: Store<S>, select?: (s: S) => T) {
  const snapshot = () => (select ? select(store.get()) : store.get())
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}
