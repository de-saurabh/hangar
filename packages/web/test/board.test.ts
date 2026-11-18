import { describe, expect, it } from 'vitest'
import type { LiveState } from '@hangar/shared'
import { boardColumn, buildBoard, withLiveOnly } from '../src/board'

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

describe('withLiveOnly', () => {
  const repos = [{ id: 'r1', name: 'api', path: 'D:/code/api' }]
  const base = [s('has-transcript')] as unknown as Parameters<typeof withLiveOnly>[0]
  const l = (id: string, status: LiveState['status'], cwd?: string) => [id, live(status, { sessionId: id, ...(cwd ? { cwd } : {}) })] as const

  it('adds a card for a live session that has no transcript, resolved to its repo', () => {
    const out = withLiveOnly(base, new Map([l('new', 'waiting', 'D:/code/api/src')]), repos)
    expect(out.map((x) => x.id)).toEqual(['has-transcript', 'new'])
    expect(out[1]).toMatchObject({ repoId: 'r1', repoName: 'api', title: 'New session' })
  })

  it('names an unregistered folder by its last segment and leaves repoId empty', () => {
    const out = withLiveOnly([], new Map([l('x', 'waiting', 'D:/demo/hangar-handoff')]), repos)
    expect(out[0]).toMatchObject({ repoName: 'hangar-handoff' })
    expect(out[0]?.repoId).toBeUndefined()
  })

  it('skips sessions that already have a transcript or are finished', () => {
    const out = withLiveOnly(base, new Map([l('has-transcript', 'waiting'), l('done', 'finished')]), repos)
    expect(out.map((x) => x.id)).toEqual(['has-transcript'])
  })

  it('puts a waiting transcript-less session in the Needs you lane even from another folder', () => {
    const all = withLiveOnly([], new Map([l('w', 'waiting', 'D:/elsewhere/proj')]), repos)
    expect(buildBoard(all, new Map([l('w', 'waiting', 'D:/elsewhere/proj')]), null, false, now).lanes.waiting.map((x) => x.id)).toEqual(['w'])
  })
})
