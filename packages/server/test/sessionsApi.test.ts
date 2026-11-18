import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SessionDetail, SessionListItem } from '@hangar/shared'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

const FIXTURE_HOME = resolve(__dirname, '../../../test/fixtures/claude-home')
const ID = '00000000-0000-4000-8000-000000000001'

let hangarHome: string
let server: Server
let base: string

beforeEach(async () => {
  hangarHome = await mkdtemp(join(tmpdir(), 'hangar-home-'))
  process.env.HANGAR_HOME = hangarHome
  server = await listenSafe(createApp({ version: 'test', claudeHome: FIXTURE_HOME }))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise((r) => server.close(r))
  delete process.env.HANGAR_HOME
  await rm(hangarHome, { recursive: true, force: true })
})

describe('sessions api', () => {
  it('lists sessions, naming the repo after the cwd folder when unregistered', async () => {
    const list = (await (await fetch(`${base}/api/sessions`)).json()) as SessionListItem[]
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: ID, title: 'Add rate limiting', repoName: 'demo', costUSD: 0.4272 })
    expect(list[0]?.repoId).toBeUndefined()
  })

  it('returns the timeline, files and summary for one session', async () => {
    const res = await fetch(`${base}/api/sessions/${ID}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const d = (await res.json()) as SessionDetail
    expect(d.session.id).toBe(ID)
    expect(d.events.length).toBeGreaterThan(5)
    expect(d.files.map((f) => f.path)).toEqual(['src/limiter.ts', 'src/index.ts'])
    expect(JSON.stringify(d)).not.toContain('FIXTURE-COMPACT-SUMMARY')
  })

  it('404s an unknown session with a JSON error', async () => {
    const res = await fetch(`${base}/api/sessions/does-not-exist`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Session not found' })
  })
})

describe('session search', () => {
  const find = async (q: string) => (await (await fetch(`${base}/api/sessions?q=${encodeURIComponent(q)}`)).json()) as SessionListItem[]

  it('finds sessions by prompt text, prefix and file path', async () => {
    expect((await find('redis')).map((s) => s.id)).toEqual([ID])
    expect((await find('limit')).map((s) => s.id)).toEqual([ID])
    expect((await find('limiter.ts')).map((s) => s.id)).toEqual([ID])
  })

  it('returns nothing for a miss and never searches compaction summaries', async () => {
    expect(await find('zzzunmatched')).toEqual([])
    expect(await find('FIXTURE-COMPACT-SUMMARY')).toEqual([])
  })

  it('treats a blank query as the full list', async () => {
    expect(await find('   ')).toHaveLength(1)
  })
})
