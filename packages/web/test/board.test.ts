import { describe, expect, it } from 'vitest'
import type { LiveState } from '@hangar/shared'
import { boardColumn, groupByColumn } from '../src/board'

const now = new Date(2026, 10, 18, 15, 0, 0) // local time, so "today" is unambiguous
const iso = (d: Date) => d.toISOString()
const today = iso(new Date(2026, 10, 18, 9, 0, 0))
const old = iso(new Date(2026, 10, 10, 9, 0, 0))
const live = (status: LiveState['status'], over: Partial<LiveState> = {}): LiveState => ({ sessionId: 'x', status, since: 1, lastEventAt: now.getTime(), ...over })

describe('boardColumn', () => {
  it('follows live status while the session is alive', () => {
    expect(boardColumn({ lastEventAt: old }, live('waiting'), now)).toBe('waiting')
    expect(boardColumn({ lastEventAt: old }, live('running'), now)).toBe('running')
    expect(boardColumn({ lastEventAt: old }, live('idle'), now)).toBe('idle')
  })

  it('puts finished sessions in "Finished today" only if active today', () => {
    expect(boardColumn({ lastEventAt: today }, live('finished'), now)).toBe('finished')
    expect(boardColumn({ lastEventAt: old }, live('finished', { lastEventAt: new Date(2026, 10, 10).getTime() }), now)).toBe('earlier')
  })

  it('handles sessions Hangar never saw live', () => {
    expect(boardColumn({ lastEventAt: today }, undefined, now)).toBe('finished')
    expect(boardColumn({ lastEventAt: old }, undefined, now)).toBe('earlier')
    expect(boardColumn({}, undefined, now)).toBe('earlier')
  })
})

describe('groupByColumn', () => {
  it('groups, and orders waiting sessions by how long they have waited', () => {
    const sessions = [
      { id: 'a', lastEventAt: today },
      { id: 'b', lastEventAt: today },
      { id: 'c', lastEventAt: old },
    ]
    const map = new Map<string, LiveState>([
      ['a', live('waiting', { sessionId: 'a', since: 500 })],
      ['b', live('waiting', { sessionId: 'b', since: 100 })],
    ])
    const g = groupByColumn(sessions, map, now)
    expect(g.waiting.map((s) => s.id)).toEqual(['b', 'a'])
    expect(g.earlier.map((s) => s.id)).toEqual(['c'])
    expect(g.running).toEqual([])
  })
})
