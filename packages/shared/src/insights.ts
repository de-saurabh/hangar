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
