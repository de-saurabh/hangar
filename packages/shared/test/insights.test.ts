import { describe, expect, it } from 'vitest'
import { buildUsageInsights, localDateKey, recordWeight, type UsageRecord } from '../src/index'

const now = new Date(2026, 10, 18, 15, 0, 0) // 18 Nov 2026, local
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString()
const rec = (t: string, over: Partial<UsageRecord> = {}): UsageRecord => ({ t, model: 'm1', input: 100, output: 100, cacheRead: 0, cacheCreation: 0, ...over })

describe('buildUsageInsights', () => {
  it('buckets by local day, zero-fills the window and spreads reported cost by token weight', () => {
    const heavy = rec(at(17), { output: 300 }) // weight 100 + 1500 = 1600
    const light = rec(at(18), { output: 100 }) // weight 100 + 500 = 600
    const out = buildUsageInsights([{ id: 's', repoName: 'api', costUSD: 2.2, records: [heavy, light] }], 7, now)
    expect(out.days).toHaveLength(7)
    expect(out.days.map((d) => d.date).slice(-2)).toEqual(['2026-11-17', '2026-11-18'])
    expect(out.days[0]).toMatchObject({ date: '2026-11-12', newTokens: 0, cost: 0 })
    expect(out.days[5]?.cost).toBeCloseTo(1.6, 5)
    expect(out.days[6]?.cost).toBeCloseTo(0.6, 5)
    expect(out.totals.cost).toBeCloseTo(2.2, 5)
    expect(out.costEstimated).toBe(false)
  })

  it('excludes cache reads from new tokens but weighs them for cost', () => {
    const r = rec(at(18), { input: 10, output: 20, cacheCreation: 30, cacheRead: 99_999 })
    expect(buildUsageInsights([{ id: 's', repoName: 'a', costUSD: 1, records: [r] }], 3, now).totals.newTokens).toBe(60)
    expect(recordWeight(r)).toBeCloseTo(10 + 100 + 37.5 + 9999.9, 3)
  })

  it('ignores records outside the window but keeps the session share consistent', () => {
    const old = rec(at(1), { output: 100 }) // outside a 7-day window
    const cur = rec(at(18), { output: 100 })
    const out = buildUsageInsights([{ id: 's', repoName: 'a', costUSD: 2, records: [old, cur] }], 7, now)
    expect(out.totals.cost).toBeCloseTo(1, 5) // half of the session's cost, not all of it
  })

  it('groups by repo and by model, sorted by cost', () => {
    const out = buildUsageInsights(
      [
        { id: '1', repoName: 'small', costUSD: 1, records: [rec(at(18), { model: 'haiku' })] },
        { id: '2', repoName: 'big', costUSD: 9, records: [rec(at(18), { model: 'opus' })] },
      ],
      3,
      now,
    )
    expect(out.byRepo.map((b) => [b.name, Math.round(b.cost)])).toEqual([['big', 9], ['small', 1]])
    expect(out.byModel.map((b) => b.name)).toEqual(['opus', 'haiku'])
  })

  it('estimates cost for sessions without one from the same model\'s reported rate', () => {
    const known = { id: 'k', repoName: 'a', costUSD: 3, records: [rec(at(17), { output: 100 })] } // weight 600 -> $0.005/unit
    const live = { id: 'l', repoName: 'a', records: [rec(at(18), { output: 100 })] } // weight 600
    const out = buildUsageInsights([known, live], 3, now)
    expect(out.costEstimated).toBe(true)
    expect(out.days[2]?.cost).toBeCloseTo(3, 5)
    expect(out.totals.cost).toBeCloseTo(6, 5)
    expect(out.unpricedTokens).toBe(0)
  })

  it('reports unpriced tokens when there is no reference rate at all', () => {
    const out = buildUsageInsights([{ id: 'l', repoName: 'a', records: [rec(at(18))] }], 3, now)
    expect(out.totals.cost).toBe(0)
    expect(out.unpricedTokens).toBe(200)
    expect(out.costEstimated).toBe(false)
  })

  it('handles empty input and bad timestamps', () => {
    expect(buildUsageInsights([], 14, now).days).toHaveLength(14)
    const out = buildUsageInsights([{ id: 's', repoName: 'a', costUSD: 1, records: [rec('not a date')] }], 3, now)
    expect(out.totals).toEqual({ newTokens: 0, cost: 0 })
  })

  it('formats local date keys', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

import { buildStuck } from '../src/index'

describe('buildStuck', () => {
  const s = (id: string, repoName: string, failures: { key: string; count: number }[], ctx?: number) => ({
    id,
    repoName,
    failures,
    ...(ctx !== undefined ? { contextTokens: ctx, contextWindow: 100 } : {}),
  })

  it('reports commands failing 3+ times across sessions, with a tip naming the repo', () => {
    const out = buildStuck([s('1', 'web-app', [{ key: 'BASH npm test', count: 2 }]), s('2', 'web-app', [{ key: 'BASH npm test', count: 3 }]), s('3', 'api', [{ key: 'BASH ls', count: 1 }])])
    expect(out.items).toEqual([{ kind: 'repeated-failure', what: 'npm test kept failing', detail: '5 failures in 2 sessions', repoName: 'web-app' }])
    expect(out.tip).toBe('Tip: add how to run and set up "npm test" to web-app/CLAUDE.md.')
  })

  it('ignores routine failures (READ) and one-offs', () => {
    expect(buildStuck([s('1', 'a', [{ key: 'READ', count: 50 }, { key: 'BASH make', count: 2 }])])).toEqual({ items: [] })
  })

  it('reports failing MCP servers and sessions over 80% context', () => {
    const out = buildStuck([s('1', 'a', [{ key: 'MCP linear', count: 3 }], 85), s('2', 'a', [], 79), s('3', 'a', [], 95)])
    expect(out.items.map((i) => [i.kind, i.what, i.detail])).toEqual([
      ['mcp', 'linear MCP calls failed', '3 failed calls'],
      ['high-context', 'Context over 80% before finishing', '2 sessions'],
    ])
    expect(out.tip).toBeUndefined()
  })
})
