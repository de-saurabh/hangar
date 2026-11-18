import {
  effectiveSettings,
  repoWarnings,
  type Dashboard,
  type DashboardMemoryChange,
  type DashboardRepo,
  type DashboardSession,
  type LiveState,
  type Repo,
  type TaskItemView,
} from '@hangar/shared'
import { stat } from 'node:fs/promises'
import { loadConfig } from './config.js'
import type { LiveStore } from './live.js'
import { withRepo, type SessionIndex } from './sessions.js'
import { read as readMemory } from './sources/claudeMd.js'
import { currentBranch, recentMemoryChanges } from './sources/gitHistory.js'
import { read as readSettings } from './sources/settings.js'

const DAY = 24 * 60 * 60_000
/** Task lists of sessions idle longer than this are considered stale. */
const TASK_FRESH_MS = 3 * DAY

const sameDay = (a: number, b: Date) => {
  const d = new Date(a)
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate()
}

/** Tiny TTL memo so a polled dashboard does not re-read files and spawn git on every request. */
function memo<T>(ttlMs: number) {
  const cache = new Map<string, { at: number; value: Promise<T> }>()
  return (key: string, fn: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value
    const value = fn()
    cache.set(key, { at: Date.now(), value })
    return value
  }
}

interface RepoFacts {
  exists: boolean
  branch?: string
  warnings: string[]
  changes: Omit<DashboardMemoryChange, 'repoName'>[]
}

const repoFacts = memo<RepoFacts>(20_000)

async function factsFor(repo: Repo, claudeHome: string): Promise<RepoFacts> {
  return repoFacts(repo.id, async () => {
    const exists = (await stat(repo.path).catch(() => undefined))?.isDirectory() ?? false
    if (!exists) return { exists, warnings: [], changes: [] }
    const [memory, layers, branch, changes] = await Promise.all([
      readMemory({ claudeHome, repoPath: repo.path }).catch(() => []),
      readSettings({ claudeHome, repoPath: repo.path }).catch(() => []),
      currentBranch(repo.path),
      recentMemoryChanges(repo.path, { sinceDays: 30, limit: 5 }),
    ])
    return { exists, ...(branch ? { branch } : {}), warnings: repoWarnings(memory, effectiveSettings(layers).permissions), changes }
  })
}

export interface DashboardDeps {
  index: SessionIndex
  live: LiveStore
  claudeHome: string
  now?: Date
}

export async function buildDashboard({ index, live, claudeHome, now = new Date() }: DashboardDeps): Promise<Dashboard> {
  await index.refresh()
  await live.poll()
  const { repos } = await loadConfig()
  const liveMap = new Map<string, LiveState>(live.snapshot().map((s) => [s.sessionId, s]))
  const nowMs = now.getTime()

  const sessions: DashboardSession[] = index.summaries().map((s) => {
    const item = withRepo(s, repos)
    const l = liveMap.get(s.id)
    return l ? { ...item, live: l } : item
  })

  const isActive = (s: DashboardSession) => s.live !== undefined && s.live.status !== 'finished'
  const activeSessions = sessions.filter(isActive)
  const today = sessions.filter((s) => (s.lastEventAt ? sameDay(Date.parse(s.lastEventAt), now) : false))

  // Tasks: only from sessions touched recently, so abandoned lists do not pile up.
  const lists = index.taskLists()
  const tasks: TaskItemView[] = []
  for (const s of sessions) {
    const last = s.lastEventAt ? Date.parse(s.lastEventAt) : 0
    if (nowMs - last > TASK_FRESH_MS) continue
    for (const t of lists.get(s.id) ?? []) {
      if (t.status !== 'completed') tasks.push({ ...t, sessionId: s.id, repoName: s.repoName })
    }
  }
  tasks.sort((a, b) => Number(b.status === 'in_progress') - Number(a.status === 'in_progress'))

  const repoViews: DashboardRepo[] = await Promise.all(
    repos.map(async (r) => {
      const f = await factsFor(r, claudeHome)
      const mine = sessions.filter((s) => s.repoId === r.id)
      return {
        id: r.id,
        name: r.name,
        path: r.path,
        exists: f.exists,
        ...(f.branch ? { branch: f.branch } : {}),
        sessionsThisWeek: mine.filter((s) => s.lastEventAt && nowMs - Date.parse(s.lastEventAt) < 7 * DAY).length,
        openTasks: tasks.filter((t) => mine.some((s) => s.id === t.sessionId)).length,
        warnings: f.warnings,
      }
    }),
  )

  const memoryChanges: DashboardMemoryChange[] = (
    await Promise.all(repos.map(async (r) => (await factsFor(r, claudeHome)).changes.map((c) => ({ ...c, repoName: r.name }))))
  )
    .flat()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)

  const waiting = activeSessions.filter((s) => s.live?.status === 'waiting').sort((a, b) => (a.live?.since ?? 0) - (b.live?.since ?? 0))

  return {
    alerts: waiting.map((s) => ({
      sessionId: s.id,
      repoName: s.repoName,
      ...(s.live?.detail ? { detail: s.live.detail } : {}),
      since: s.live?.since ?? nowMs,
    })),
    stats: {
      activeSessions: activeSessions.length,
      waiting: waiting.length,
      sessionsToday: today.length,
      // New tokens only: cache reads would dwarf everything and say little about work done.
      tokensToday: today.reduce((n, s) => n + s.tokens.input + s.tokens.output + s.tokens.cacheCreation, 0),
      costToday: today.reduce((n, s) => n + (s.costUSD ?? 0), 0),
      openTasks: tasks.length,
      inProgressTasks: tasks.filter((t) => t.status === 'in_progress').length,
    },
    live: activeSessions.sort((a, b) => Number(b.live?.status === 'waiting') - Number(a.live?.status === 'waiting')).slice(0, 8),
    repos: repoViews,
    tasks: tasks.slice(0, 12),
    memoryChanges,
  }
}
