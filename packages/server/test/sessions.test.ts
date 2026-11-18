import { appendFile, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionIndex } from '../src/sessions.js'

const FIXTURE = resolve(__dirname, '../../../test/fixtures/claude-home')
const ID = '00000000-0000-4000-8000-000000000001'

let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'hangar-si-'))
  await cp(FIXTURE, home, { recursive: true })
})
afterEach(() => rm(home, { recursive: true, force: true }))

describe('SessionIndex', () => {
  it('summarises the fixture session', async () => {
    const idx = new SessionIndex(home, 0)
    await idx.refresh()
    const list = idx.summaries()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: ID,
      title: 'Add rate limiting',
      cwd: String.raw`C:\code\demo`,
      gitBranch: 'feat/rate-limit',
      costUSD: 0.4272,
      compactions: 1,
      prompts: 1,
      toolCalls: 4,
      model: 'claude-sonnet-fixture',
    })
  })

  it('builds the timeline on demand without leaking compaction summaries', async () => {
    const idx = new SessionIndex(home, 0)
    const d = await idx.detail(ID)
    expect(d?.events.map((e) => e.label)).toEqual(['YOU', 'CLAUDE', 'READ', 'WRITE', 'BASH', 'COMPACTED', 'EDIT'])
    expect(d?.events.find((e) => e.label === 'BASH')).toMatchObject({ failed: true })
    expect(JSON.stringify(d)).not.toContain('FIXTURE-COMPACT-SUMMARY')
    expect(d?.files).toEqual([
      { path: 'src/limiter.ts', added: 4, removed: 0, created: true },
      { path: 'src/index.ts', added: 2, removed: 1 },
    ])
  })

  it('picks up appended lines incrementally', async () => {
    const idx = new SessionIndex(home, 0)
    await idx.refresh()
    const file = join(home, 'projects', 'C--code-demo', `${ID}.jsonl`)
    await appendFile(file, JSON.stringify({ type: 'user', timestamp: '2026-01-01T11:00:00.000Z', message: { role: 'user', content: 'one more thing' } }) + '\n')
    await idx.refresh()
    expect(idx.summaries()[0]).toMatchObject({ prompts: 2, lastEventAt: '2026-01-01T11:00:00.000Z' })
  })

  it('returns undefined for an unknown session and survives a missing home', async () => {
    expect(await new SessionIndex(home, 0).detail('nope')).toBeUndefined()
    const empty = new SessionIndex(join(home, 'missing'), 0)
    await empty.refresh()
    expect(empty.summaries()).toEqual([])
  })
})
