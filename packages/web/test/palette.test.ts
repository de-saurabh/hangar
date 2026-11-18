import { describe, expect, it } from 'vitest'
import { PAGES, rank, score, type PaletteItem } from '../src/palette'

const item = (label: string, hint?: string): PaletteItem => ({ id: label, label, ...(hint ? { hint } : {}), group: 'Sessions', to: '/x' })

describe('score', () => {
  it('ranks prefix > word start > substring > scattered, and 0 for no match', () => {
    const q = 'ses'
    const s = [score(q, 'Sessions'), score(q, 'My sessions'), score(q, 'Obsession'), score(q, 'sxexsy')]
    expect(s[0]).toBeGreaterThan(s[1]!)
    expect(s[1]).toBeGreaterThan(s[2]!)
    expect(s[2]).toBeGreaterThan(s[3]!)
    expect(s[3]).toBeGreaterThan(0)
    expect(score('zzz', 'Sessions')).toBe(0)
  })

  it('matches everything on an empty query and ignores case', () => {
    expect(score('', 'x')).toBeGreaterThan(0)
    expect(score('SESS', 'sessions')).toBeGreaterThan(0)
  })
})

describe('rank', () => {
  it('orders by score, uses the hint as a weaker signal, and limits results', () => {
    const items = [item('Fix N+1 query', 'api-server'), item('API docs'), item('Add rate limiting', 'api-server')]
    expect(rank(items, 'api').map((i) => i.label)).toEqual(['API docs', 'Fix N+1 query', 'Add rate limiting'])
    expect(rank(items, '', 2)).toHaveLength(2)
    expect(rank(items, 'nothing-like-this')).toEqual([])
  })

  it('finds pages', () => {
    expect(rank(PAGES, 'ins')[0]?.to).toBe('/insights')
  })
})
