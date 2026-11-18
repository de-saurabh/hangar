import { useCallback, useSyncExternalStore } from 'react'

/**
 * The repo every page is filtered to: a repo id, or null for "All repos".
 * One module-level store so the scope strip and the pages read the same value;
 * it is remembered across visits when storage allows it.
 */
const KEY = 'hangar.scope'
const listeners = new Set<() => void>()

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null // storage can be blocked; the scope just resets on reload
  }
}

let current = read()

function set(id: string | null): void {
  current = id
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    // not persisted; still applied for this visit
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useScope(): readonly [string | null, (id: string | null) => void] {
  const id = useSyncExternalStore(subscribe, () => current)
  return [id, useCallback(set, [])] as const
}
