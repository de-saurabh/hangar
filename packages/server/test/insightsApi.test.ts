import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UsageInsightsResponse } from '@hangar/shared'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

let hangarHome: string
let claude: string
let server: Server
let base: string
const line = (o: unknown) => JSON.stringify(o) + '\n'

beforeEach(async () => {
  hangarHome = await mkdtemp(join(tmpdir(), 'hangar-ih-'))
  claude = await mkdtemp(join(tmpdir(), 'hangar-ic-'))
  process.env.HANGAR_HOME = hangarHome
  const now = new Date().toISOString()
  const proj = join(claude, 'projects', 'p')
  await mkdir(proj, { recursive: true })
  const msg = (id: string, model: string, out: number) =>
    line({ type: 'assistant', timestamp: now, cwd: '/work/api', message: { id, model, content: [], usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 } } })
  await writeFile(join(proj, 'a.jsonl'), msg('1', 'claude-opus-test', 100) + line({ type: 'cost-state', totalCostUSD: 2, startTime: Date.parse(now) - 5000 }))
  await writeFile(join(proj, 'b.jsonl'), msg('2', 'claude-opus-test', 100)) // still running: no cost-state
  server = await listenSafe(createApp({ version: 't', claudeHome: claude }))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  delete process.env.HANGAR_HOME
  for (const d of [hangarHome, claude]) await rm(d, { recursive: true, force: true })
})

const get = async (q = '') => (await (await fetch(`${base}/api/insights/usage${q}`)).json()) as UsageInsightsResponse
const putPrefs = (body: unknown) => fetch(`${base}/api/prefs`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('GET /api/insights/usage', () => {
  it('returns a zero-filled window with today priced, the running session estimated', async () => {
    const u = await get('?days=7')
    expect(u.days).toHaveLength(7)
    const today = u.days[6]!
    expect(today.newTokens).toBe(2 * (10 + 100)) // two sessions, cache reads excluded
    expect(today.cost).toBeCloseTo(4, 5) // $2 reported + $2 estimated from the same model's rate
    expect(u.costEstimated).toBe(true)
    expect(u.byRepo).toMatchObject([{ name: 'api' }])
    expect(u.byModel[0]?.name).toBe('claude-opus-test')
    expect(u.budget).toEqual({ dailyBudgetUSD: null, todayCost: expect.any(Number), over: false })
  })

  it('clamps days and defaults to 14', async () => {
    expect((await get()).days).toHaveLength(14)
    expect((await get('?days=9999')).days).toHaveLength(90)
    expect((await get('?days=0')).days).toHaveLength(14)
    expect((await get('?days=abc')).days).toHaveLength(14)
  })

  it('flags when today exceeds the daily budget and validates the budget pref', async () => {
    expect((await putPrefs({ dailyBudgetUSD: 3 })).status).toBe(200)
    expect((await get()).budget).toMatchObject({ dailyBudgetUSD: 3, over: true })
    expect((await putPrefs({ dailyBudgetUSD: 100 })).status).toBe(200)
    expect((await get()).budget.over).toBe(false)
    expect((await putPrefs({ dailyBudgetUSD: -5 })).status).toBe(400)
    expect((await putPrefs({ dailyBudgetUSD: 'lots' })).status).toBe(400)
    expect((await putPrefs({ dailyBudgetUSD: null })).status).toBe(200)
    expect((await get()).budget.dailyBudgetUSD).toBeNull()
  })
})

describe('GET /api/insights/summary', () => {
  it('reports repeated failures and a shipped list built from session titles and commits', async () => {
    const { execFileSync } = await import('node:child_process')
    const repo = await mkdtemp(join(tmpdir(), 'hangar-ir-'))
    try {
      const g = (...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@e.com', '-c', 'commit.gpgsign=false', ...a])
      g('init', '-q', '-b', 'main')
      await writeFile(join(repo, 'a.txt'), 'x')
      g('add', '.')
      g('commit', '-q', '-m', 'Add rate limiter')

      const now = new Date().toISOString()
      const common = { cwd: repo, timestamp: now }
      const bash = (n: number) =>
        line({ type: 'assistant', ...common, message: { id: `m${n}`, model: 'm', content: [{ type: 'tool_use', id: `t${n}`, name: 'Bash', input: { command: 'npm test -- x' } }] } }) +
        line({ type: 'user', ...common, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${n}`, is_error: true, content: 'fail' }] } })
      await writeFile(join(claude, 'projects', 'p', 'c.jsonl'), line({ type: 'custom-title', customTitle: 'Add rate limiting' }) + line({ type: 'user', ...common, message: { role: 'user', content: 'go' } }) + bash(1) + bash(2) + bash(3))
      await fetch(`${base}/api/repos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: repo }) })

      const s = (await (await fetch(`${base}/api/insights/summary`)).json()) as import('@hangar/shared').InsightsSummary
      expect(s.stuck.items).toMatchObject([{ kind: 'repeated-failure', what: 'npm test kept failing', detail: '3 failures in 1 session' }])
      expect(s.stuck.tip).toContain('CLAUDE.md')
      const mine = s.shipped.find((x) => x.commits.some((c) => c.subject === 'Add rate limiter'))
      expect(mine?.sessions).toContain('Add rate limiting')
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })
})
