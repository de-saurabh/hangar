import { isInside, lastSegment, type LiveState, type SessionListItem } from '@hangar/shared'

export type BoardColumn = 'waiting' | 'running' | 'idle' | 'finished' | 'earlier'

/** The four fixed lanes of the Dashboard, in order. Class names are literal so Tailwind keeps them. */
export const LANES = [
  { id: 'waiting', label: 'Needs you', dot: 'bg-waiting', stripe: 'before:bg-waiting', empty: 'Nothing needs you.' },
  { id: 'running', label: 'Running', dot: 'bg-running', stripe: 'before:bg-running', empty: 'No session is running.' },
  { id: 'idle', label: 'Idle', dot: 'bg-muted', stripe: 'before:bg-track', empty: 'No idle sessions.' },
  { id: 'finished', label: 'Finished today', dot: 'bg-done', stripe: 'before:bg-done', empty: 'Nothing finished yet today.' },
] as const satisfies readonly { id: BoardColumn; label: string; dot: string; stripe: string; empty: string }[]

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

/**
 * Live sessions that have no transcript yet (they are known only through
 * hooks, e.g. just started) get a minimal card, so a session waiting for you
 * is never missing from the board while the header badge counts it.
 */
export function withLiveOnly(sessions: SessionListItem[], live: Map<string, LiveState>, repos: { id: string; name: string; path: string }[]): SessionListItem[] {
  const known = new Set(sessions.map((s) => s.id))
  const extra: SessionListItem[] = []
  for (const l of live.values()) {
    if (known.has(l.sessionId) || l.status === 'finished') continue
    const repo = l.cwd ? repos.find((r) => isInside(l.cwd!, r.path)) : undefined
    extra.push({
      id: l.sessionId,
      ...(l.cwd ? { cwd: l.cwd } : {}),
      title: 'New session',
      titleSource: 'none',
      models: [],
      lastEventAt: new Date(l.lastEventAt).toISOString(),
      prompts: 0,
      assistantMessages: 0,
      toolCalls: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      compactions: 0,
      tasks: { open: 0, inProgress: 0, done: 0 },
      failures: [],
      ...(repo ? { repoId: repo.id } : {}),
      repoName: repo?.name ?? (l.cwd ? lastSegment(l.cwd) : 'Unknown folder'),
    })
  }
  return [...sessions, ...extra]
}

export interface Board<T> {
  lanes: Record<BoardColumn, T[]>
  /** Sessions from folders that are not registered repos, kept out of the lanes until asked for. */
  hiddenOther: number
}

/**
 * The Dashboard's lanes for one scope (a repo id, or null for all repos).
 * Sessions from unregistered folders stay hidden unless `showOther` is set;
 * a session waiting for you is never hidden.
 */
export function buildBoard<T extends Pick<SessionListItem, 'id' | 'lastEventAt' | 'repoId'>>(
  sessions: T[],
  live: Map<string, LiveState>,
  scope: string | null,
  showOther: boolean,
  now: Date = new Date(),
): Board<T> {
  const lanes = groupByColumn(
    sessions.filter((s) => !scope || s.repoId === scope),
    live,
    now,
  )
  let hiddenOther = 0
  for (const id of ['running', 'idle', 'finished'] as const) {
    lanes[id] = lanes[id].filter((s) => {
      const hide = !s.repoId && !showOther
      if (hide) hiddenOther++
      return !hide
    })
  }
  return { lanes, hiddenOther }
}

/** The status dot colour for a session in any column; sessions from earlier days count as finished. */
export const columnDot = (column: BoardColumn): string => LANES.find((l) => l.id === column)?.dot ?? 'bg-done'
