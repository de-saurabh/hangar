import type { SessionListItem } from '@hangar/shared'
import { shortModel } from './format'

export type TimeRange = 'today' | '7d' | 'all'
export type SortOrder = 'recent' | 'cost'

export interface SessionFilters {
  /** A repo id, or null for all repos. */
  scope: string | null
  time: TimeRange
  /** A model family such as "Opus", or null for any. */
  model: string | null
  /** Only sessions with failed tool calls. */
  problems: boolean
  sort: SortOrder
}

export const DEFAULT_FILTERS: SessionFilters = { scope: null, time: 'all', model: null, problems: false, sort: 'recent' }

type Filterable = Pick<SessionListItem, 'repoId' | 'lastEventAt' | 'model' | 'failures' | 'costUSD'>

const DAY_MS = 86_400_000

/** "claude-opus-5-5" -> "Opus". Empty when the model is unknown. */
export function modelFamily(model: string | undefined): string {
  return model ? (shortModel(model).split(' ')[0] ?? '') : ''
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

function inRange(lastEventAt: string | undefined, time: TimeRange, now: Date): boolean {
  if (time === 'all') return true
  if (!lastEventAt) return false
  const last = new Date(lastEventAt)
  return time === 'today' ? sameDay(last, now) : now.getTime() - last.getTime() <= 7 * DAY_MS
}

/** Applies the filters, then orders by most recent or most expensive. */
export function filterSessions<T extends Filterable>(sessions: T[], f: SessionFilters, now: Date = new Date()): T[] {
  const time = (s: T) => (s.lastEventAt ? new Date(s.lastEventAt).getTime() : 0)
  return sessions
    .filter((s) => (!f.scope || s.repoId === f.scope) && inRange(s.lastEventAt, f.time, now) && (!f.model || modelFamily(s.model) === f.model) && (!f.problems || s.failures.length > 0))
    .sort(f.sort === 'cost' ? (a, b) => (b.costUSD ?? 0) - (a.costUSD ?? 0) : (a, b) => time(b) - time(a))
}
