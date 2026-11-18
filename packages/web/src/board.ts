import type { LiveState, SessionListItem } from '@hangar/shared'

export type BoardColumn = 'waiting' | 'running' | 'idle' | 'finished' | 'earlier'

export const COLUMNS: { id: BoardColumn; label: string; dot: string }[] = [
  { id: 'waiting', label: 'Waiting for you', dot: 'bg-waiting' },
  { id: 'running', label: 'Running', dot: 'bg-running' },
  { id: 'idle', label: 'Idle', dot: 'bg-muted' },
  { id: 'finished', label: 'Finished today', dot: 'bg-done' },
]

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * Which board column a session belongs in. Live state decides while the
 * session is alive; anything finished (or never seen live) lands in
 * "Finished today" if it was active today, else "earlier".
 */
export function boardColumn(s: Pick<SessionListItem, 'lastEventAt'>, live: LiveState | undefined, now: Date = new Date()): BoardColumn {
  if (live && live.status !== 'finished') return live.status
  const last = s.lastEventAt ? new Date(s.lastEventAt) : undefined
  const lastMs = Math.max(last?.getTime() ?? 0, live?.lastEventAt ?? 0)
  return lastMs > 0 && sameDay(new Date(lastMs), now) ? 'finished' : 'earlier'
}

export function groupByColumn<T extends Pick<SessionListItem, 'id' | 'lastEventAt'>>(
  sessions: T[],
  live: Map<string, LiveState>,
  now: Date = new Date(),
): Record<BoardColumn, T[]> {
  const out: Record<BoardColumn, T[]> = { waiting: [], running: [], idle: [], finished: [], earlier: [] }
  for (const s of sessions) out[boardColumn(s, live.get(s.id), now)].push(s)
  // Waiting: longest-waiting first, since those are the ones blocked on you.
  out.waiting.sort((a, b) => (live.get(a.id)?.since ?? 0) - (live.get(b.id)?.since ?? 0))
  return out
}
