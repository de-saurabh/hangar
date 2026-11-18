import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, filterSessions, modelFamily } from '../src/sessionFilters'

const now = new Date('2026-11-18T12:00:00')
const s = (id: string, over: object = {}) => ({ id, repoId: 'r1', lastEventAt: '2026-11-18T09:00:00', model: 'claude-opus-5-5', failures: [], costUSD: 1, ...over })

describe('modelFamily', () => {
  it('reduces a model id to its family', () => {
    expect(modelFamily('claude-sonnet-5-5')).toBe('Sonnet')
    expect(modelFamily(undefined)).toBe('')
  })
})

describe('filterSessions', () => {
  const all = [
    s('today-opus'),
    s('week-sonnet', { lastEventAt: '2026-11-14T09:00:00', model: 'claude-sonnet-5-5', costUSD: 5 }),
    s('old-other-repo', { lastEventAt: '2026-10-01T09:00:00', repoId: 'r2', failures: [{ key: 'pnpm test', count: 3 }], costUSD: 9 }),
    s('never', { lastEventAt: undefined }),
  ]
  const ids = (f: Partial<typeof DEFAULT_FILTERS>) => filterSessions(all, { ...DEFAULT_FILTERS, ...f }, now).map((x) => x.id)

  it('orders by most recent by default, sessions without a time last', () => {
    expect(ids({})).toEqual(['today-opus', 'week-sonnet', 'old-other-repo', 'never'])
  })
  it('narrows by time range', () => {
    expect(ids({ time: 'today' })).toEqual(['today-opus'])
    expect(ids({ time: '7d' })).toEqual(['today-opus', 'week-sonnet'])
  })
  it('narrows by scope, model family and problems', () => {
    expect(ids({ scope: 'r2' })).toEqual(['old-other-repo'])
    expect(ids({ model: 'Sonnet' })).toEqual(['week-sonnet'])
    expect(ids({ problems: true })).toEqual(['old-other-repo'])
  })
  it('can put the most expensive first', () => {
    expect(ids({ sort: 'cost' })[0]).toBe('old-other-repo')
  })
})
