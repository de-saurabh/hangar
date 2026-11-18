import { LARGE_MEMORY_TOKENS, type MemoryFile } from './memory'
import type { SessionListItem, TaskItemView } from './sessionApi'
import type { EffectiveSettings, SettingScope } from './settings'
import type { LiveState } from './liveStatus'

/** Warnings shown on a repo card. Short, factual, never file content. */
export function repoWarnings(memory: MemoryFile[], permissions: EffectiveSettings['permissions']): string[] {
  const out: string[] = []

  // Nested CLAUDE.md files load lazily, so only count the ones loaded at startup.
  const loaded = memory.filter((m) => m.exists && m.kind !== 'nested' && (m.tokens ?? 0) > LARGE_MEMORY_TOKENS)
  const biggest = loaded.sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0))[0]
  if (biggest) out.push(`${biggest.label} is ~${((biggest.tokens ?? 0) / 1000).toFixed(1)}k tokens, loaded every session`)

  const broad = permissions.allow.find((r) => /^(\*|Bash|PowerShell|Bash\(\*\)|PowerShell\(\*\)|Bash\(\*:\*\))$/.test(r.rule.trim()))
  if (broad) out.push(`${scopeFile(broad.sources[0])} allows ${broad.rule.trim() === '*' ? 'every tool' : `${broad.rule.replace(/\(.*$/, '')}(*)`}`)
  return out
}

function scopeFile(scope: SettingScope | undefined): string {
  switch (scope) {
    case 'local': return 'settings.local.json'
    case 'project': return 'Project settings'
    case 'managed': return 'Managed settings'
    default: return 'User settings'
  }
}

export interface DashboardStats {
  activeSessions: number
  waiting: number
  /** Sessions with activity today. Totals are per session, not per day. */
  sessionsToday: number
  tokensToday: number
  costToday: number
  openTasks: number
  inProgressTasks: number
}

export interface DashboardRepo {
  id: string
  name: string
  path: string
  exists: boolean
  branch?: string
  sessionsThisWeek: number
  openTasks: number
  warnings: string[]
}

export interface DashboardAlert {
  sessionId: string
  repoName: string
  detail?: string
  since: number
}

export interface DashboardMemoryChange {
  repoName: string
  commit: string
  date: string
  subject: string
  file: string
  added: number
  removed: number
}

export interface DashboardSession extends SessionListItem {
  live?: LiveState
}

export interface Dashboard {
  alerts: DashboardAlert[]
  stats: DashboardStats
  live: DashboardSession[]
  repos: DashboardRepo[]
  tasks: TaskItemView[]
  memoryChanges: DashboardMemoryChange[]
}
