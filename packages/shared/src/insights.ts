import type { UsageRecord } from './session'

/**
 * Relative price of each token kind (input = 1). These ratios are stable
 * across Claude models, so they are used only to SPREAD a session's reported
 * cost across days and to estimate cost for sessions that have none yet.
 */
export const TOKEN_WEIGHTS = { input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 } as const

export function recordWeight(r: UsageRecord): number {
  return r.input * TOKEN_WEIGHTS.input + r.output * TOKEN_WEIGHTS.output + r.cacheCreation * TOKEN_WEIGHTS.cacheCreation + r.cacheRead * TOKEN_WEIGHTS.cacheRead
}

/** Tokens that represent new work (cache reads excluded). */
export const newTokens = (r: UsageRecord): number => r.input + r.output + r.cacheCreation

/** Local calendar day, "2026-11-18". */
export function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export interface SessionUsageInput {
  id: string
  repoName: string
  /** Reported by Claude Code for the current run. Undefined for sessions still running. */
  costUSD?: number
  records: UsageRecord[]
}

export interface DayUsage {
  date: string
  newTokens: number
  cost: number
}

export interface UsageBucket {
  name: string
  newTokens: number
  cost: number
}

export interface BudgetStatus {
  dailyBudgetUSD: number | null
  todayCost: number
  /** True once today's (possibly estimated) cost exceeds the budget. */
  over: boolean
}

export interface UsageInsightsResponse extends UsageInsights {
  budget: BudgetStatus
}

export interface UsageInsights {
  /** Oldest first; always `days` entries, zero-filled. */
  days: DayUsage[]
  byRepo: UsageBucket[]
  byModel: UsageBucket[]
  totals: { newTokens: number; cost: number }
  /** True if any cost shown was estimated (a session had no reported cost yet). */
  costEstimated: boolean
  /** Tokens in the window that could not be priced at all (no reference rate yet). */
  unpricedTokens: number
}

const add = (m: Map<string, UsageBucket>, name: string, tokens: number, cost: number) => {
  const b = m.get(name) ?? { name, newTokens: 0, cost: 0 }
  b.newTokens += tokens
  b.cost += cost
  m.set(name, b)
}

const byCostThenTokens = (a: UsageBucket, b: UsageBucket) => b.cost - a.cost || b.newTokens - a.newTokens

export function buildUsageInsights(sessions: SessionUsageInput[], dayCount: number, now: Date = new Date()): UsageInsights {
  // Reference price per weight unit, learned from sessions that do have a reported cost.
  const perModel = new Map<string, { cost: number; weight: number }>()
  let allCost = 0
  let allWeight = 0
  for (const s of sessions) {
    if (s.costUSD === undefined || s.records.length === 0) continue
    const w = s.records.reduce((n, r) => n + recordWeight(r), 0)
    if (w <= 0) continue
    allCost += s.costUSD
    allWeight += w
    const models = new Set(s.records.map((r) => r.model))
    if (models.size === 1) {
      const m = [...models][0] as string
      const cur = perModel.get(m) ?? { cost: 0, weight: 0 }
      cur.cost += s.costUSD
      cur.weight += w
      perModel.set(m, cur)
    }
  }
  const overallRate = allWeight > 0 ? allCost / allWeight : undefined
  const rateFor = (model: string) => {
    const m = perModel.get(model)
    return m && m.weight > 0 ? m.cost / m.weight : overallRate
  }

  const dayKeys: string[] = []
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    dayKeys.push(localDateKey(d))
  }
  const days = new Map<string, DayUsage>(dayKeys.map((date) => [date, { date, newTokens: 0, cost: 0 }]))
  const repos = new Map<string, UsageBucket>()
  const models = new Map<string, UsageBucket>()
  let costEstimated = false
  let unpricedTokens = 0

  for (const s of sessions) {
    if (s.records.length === 0) continue
    const totalWeight = s.records.reduce((n, r) => n + recordWeight(r), 0)
    let cost = s.costUSD
    if (cost === undefined && totalWeight > 0) {
      // Dominant model by weight decides which reference rate to use.
      const byModelWeight = new Map<string, number>()
      for (const r of s.records) byModelWeight.set(r.model, (byModelWeight.get(r.model) ?? 0) + recordWeight(r))
      const dominant = [...byModelWeight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      const rate = rateFor(dominant)
      if (rate !== undefined) {
        cost = rate * totalWeight
        costEstimated = true
      }
    }
    for (const r of s.records) {
      const day = days.get(localDateKey(new Date(r.t)))
      if (!day) continue // outside the window (or an unparseable timestamp)
      const tokens = newTokens(r)
      const share = cost !== undefined && totalWeight > 0 ? (cost * recordWeight(r)) / totalWeight : 0
      if (cost === undefined) unpricedTokens += tokens
      day.newTokens += tokens
      day.cost += share
      add(repos, s.repoName, tokens, share)
      add(models, r.model, tokens, share)
    }
  }

  const list = [...days.values()]
  return {
    days: list,
    byRepo: [...repos.values()].sort(byCostThenTokens),
    byModel: [...models.values()].sort(byCostThenTokens),
    totals: { newTokens: list.reduce((n, d) => n + d.newTokens, 0), cost: list.reduce((n, d) => n + d.cost, 0) },
    costEstimated,
    unpricedTokens,
  }
}

export interface StuckInput {
  id: string
  repoName: string
  contextTokens?: number
  contextWindow?: number
  failures: { key: string; count: number }[]
}

export interface StuckItem {
  kind: 'repeated-failure' | 'high-context' | 'mcp'
  what: string
  /** Display count, e.g. "5 failures in 3 sessions". */
  detail: string
  repoName?: string
}

export interface StuckInsights {
  items: StuckItem[]
  tip?: string
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * "Where Claude got stuck": commands that kept failing, sessions that ran
 * past 80% context, and failing MCP servers. Thresholds are deliberately
 * conservative so a one-off failure is not reported.
 */
export function buildStuck(sessions: StuckInput[]): StuckInsights {
  const items: StuckItem[] = []

  const byKey = new Map<string, { count: number; sessions: Set<string>; repos: Map<string, number> }>()
  for (const s of sessions) {
    for (const f of s.failures) {
      const e = byKey.get(f.key) ?? { count: 0, sessions: new Set<string>(), repos: new Map<string, number>() }
      e.count += f.count
      e.sessions.add(s.id)
      e.repos.set(s.repoName, (e.repos.get(s.repoName) ?? 0) + f.count)
      byKey.set(f.key, e)
    }
  }

  const topRepo = (e: { repos: Map<string, number> }) => [...e.repos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  let firstRepeated: { key: string; repo?: string } | undefined
  for (const [key, e] of [...byKey.entries()].sort((a, b) => b[1].count - a[1].count)) {
    if (e.count < 3) continue
    if (key.startsWith('MCP ')) {
      items.push({ kind: 'mcp', what: `${key.slice(4)} MCP calls failed`, detail: plural(e.count, 'failed call') })
    } else if (!/^(READ|SEARCH|WEB)$/.test(key)) {
      // File-not-found style failures are routine; only commands are interesting.
      const repo = topRepo(e)
      items.push({ kind: 'repeated-failure', what: `${key.replace(/^[A-Z]+ /, '')} kept failing`, detail: `${plural(e.count, 'failure')} in ${plural(e.sessions.size, 'session')}`, ...(repo ? { repoName: repo } : {}) })
      firstRepeated ??= { key: key.replace(/^[A-Z]+ /, ''), ...(repo ? { repo } : {}) }
    }
  }

  const high = sessions.filter((s) => s.contextTokens !== undefined && s.contextWindow && s.contextTokens / s.contextWindow >= 0.8)
  if (high.length > 0) items.push({ kind: 'high-context', what: 'Context over 80% before finishing', detail: plural(high.length, 'session') })

  return {
    items: items.slice(0, 8),
    ...(firstRepeated ? { tip: `Tip: add how to run and set up "${firstRepeated.key}" to ${firstRepeated.repo ? `${firstRepeated.repo}/` : ''}CLAUDE.md.` } : {}),
  }
}

export interface ShippedItem {
  repoName: string
  /** Titles of sessions active in the window, newest first. */
  sessions: string[]
  commits: { commit: string; subject: string }[]
}

export interface InsightsSummary {
  windowDays: number
  stuck: StuckInsights
  shipped: ShippedItem[]
}
