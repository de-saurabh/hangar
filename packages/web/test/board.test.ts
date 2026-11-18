import { describe, expect, it } from 'vitest'
import type { LiveState } from '@hangar/shared'
import { boardColumn, buildBoard } from '../src/board'

const now = new Date('2026-11-18T12:00:00')
const live = (status: LiveState['status'], over: Partial<LiveState> = {}): LiveState => ({ sessionId: 'x', status, since: 1, lastEventAt: 1, ...over })
const s = (id: string, over: object = {}) => ({ id, repoId: 'r1', lastEventAt: '2026-11-18T09:00:00', ...over })

describe('boardColumn', () => {
  it('uses live status while alive, else finished-today or earlier', () => {
    expect(boardColumn(s('a'), live('waiting'), now)).toBe('waiting')
    expect(boardColumn(s('a'), live('finished'), now)).toBe('finished')
    expect(boardColumn(s('a', { lastEventAt: '2026-11-01T09:00:00' }), undefined, now)).toBe('earlier')
  })
})

describe('buildBoard', () => {
  const sessions = [s('mine'), s('other-folder', { repoId: undefined }), s('waiting-other', { repoId: undefined }), s('elsewhere', { repoId: 'r2' })]
  const liveMap = new Map([
    ['mine', live('running')],
    ['other-folder', live('idle')],
    ['waiting-other', live('waiting')],
    ['elsewhere', live('running')],
  ])
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

  it('hides unregistered folders except waiting sessions, and counts what it hid', () => {
    const b = buildBoard(sessions, liveMap, null, false, now)
    expect(ids(b.lanes.running)).toEqual(['mine', 'elsewhere'])
    expect(ids(b.lanes.waiting)).toEqual(['waiting-other'])
    expect(b.hiddenOther).toBe(1)
  })
  it('shows them on request', () => {
    expect(ids(buildBoard(sessions, liveMap, null, true, now).lanes.idle)).toEqual(['other-folder'])
  })
  it('filters to one repo', () => {
    const b = buildBoard(sessions, liveMap, 'r2', false, now)
    expect(ids(b.lanes.running)).toEqual(['elsewhere'])
    expect(b.lanes.waiting).toEqual([])
  })
})
