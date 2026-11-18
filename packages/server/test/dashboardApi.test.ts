import { execFileSync } from 'node:child_process'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Dashboard } from '@hangar/shared'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

let hangarHome: string
let claude: string
let repo: string
let server: Server
let base: string

const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' })
const line = (o: unknown) => JSON.stringify(o) + '\n'

beforeEach(async () => {
  hangarHome = await mkdtemp(join(tmpdir(), 'hangar-dh-'))
  claude = await mkdtemp(join(tmpdir(), 'hangar-dc-'))
  repo = await mkdtemp(join(tmpdir(), 'hangar-dr-'))
  process.env.HANGAR_HOME = hangarHome

  // A repo with a big CLAUDE.md committed, and a broad allow rule in settings.local.json.
  git('init', '-q', '-b', 'main')
  await writeFile(join(repo, 'CLAUDE.md'), 'x'.repeat(20_000))
  await mkdir(join(repo, '.claude'))
  await writeFile(join(repo, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(*)'] } }))
  git('add', 'CLAUDE.md')
  git('commit', '-q', '-m', 'add memory')

  // One live-ish session in that repo, with a task list, active "now".
  const now = new Date().toISOString()
  const proj = join(claude, 'projects', 'proj')
  await mkdir(proj, { recursive: true })
  const common = { cwd: repo, sessionId: 's1', gitBranch: 'main' }
  await writeFile(
    join(proj, 's1.jsonl'),
    line({ type: 'user', timestamp: now, message: { role: 'user', content: 'do the thing' }, ...common }) +
      line({
        type: 'assistant',
        timestamp: now,
        message: {
          id: 'm1',
          model: 'claude-test',
          content: [{ type: 'tool_use', id: 't1', name: 'TodoWrite', input: { todos: [{ content: 'Step one', status: 'completed' }, { content: 'Step two', status: 'in_progress' }, { content: 'Step three', status: 'pending' }] } }],
          usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5000, cache_creation_input_tokens: 100 },
        },
        ...common,
      }) +
      line({ type: 'cost-state', totalCostUSD: 1.25, startTime: Date.parse(now) - 1000 }),
  )

  server = await listenSafe(createApp({ version: 't', claudeHome: claude }))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const add = await fetch(`${base}/api/repos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: repo }) })
  expect(add.status).toBe(201)
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  delete process.env.HANGAR_HOME
  for (const d of [hangarHome, claude, repo]) await rm(d, { recursive: true, force: true })
})

describe('GET /api/dashboard', () => {
  it('aggregates stats, repos, tasks, warnings and CLAUDE.md changes', async () => {
    const res = await fetch(`${base}/api/dashboard`)
    expect(res.status).toBe(200)
    const d = (await res.json()) as Dashboard

    expect(d.stats).toMatchObject({ sessionsToday: 1, openTasks: 2, inProgressTasks: 1, costToday: 1.25, waiting: 0 })
    expect(d.stats.tokensToday).toBe(10 + 20 + 100) // cache reads excluded
    expect(d.tasks.map((t) => [t.text, t.status])).toEqual([['Step two', 'in_progress'], ['Step three', 'pending']])
    expect(d.tasks[0]?.repoName).toBeTruthy()

    expect(d.repos).toHaveLength(1)
    expect(d.repos[0]).toMatchObject({ branch: 'main', sessionsThisWeek: 1, openTasks: 2, exists: true })
    expect(d.repos[0]?.warnings.join(' ')).toContain('loaded every session')
    expect(d.repos[0]?.warnings.join(' ')).toContain('settings.local.json allows Bash(*)')

    expect(d.memoryChanges).toMatchObject([{ subject: 'add memory', file: 'CLAUDE.md', added: 1 }])
  })

  it('shows waiting sessions as alerts and counts them as active', async () => {
    await fetch(`${base}/api/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: 's1', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm run db:migrate' } }),
    })
    const d = (await (await fetch(`${base}/api/dashboard`)).json()) as Dashboard
    expect(d.alerts).toMatchObject([{ sessionId: 's1', detail: 'Bash: npm run db:migrate' }])
    expect(d.stats).toMatchObject({ activeSessions: 1, waiting: 1 })
    expect(d.live[0]?.live?.status).toBe('waiting')
  })

  it('is empty and calm with nothing registered', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'hangar-de-'))
    process.env.HANGAR_HOME = empty
    try {
      const d = (await (await fetch(`${base}/api/dashboard`)).json()) as Dashboard
      expect(d.repos).toEqual([])
      expect(d.memoryChanges).toEqual([])
      expect(d.stats.sessionsToday).toBe(1) // sessions still counted without a registered repo
    } finally {
      process.env.HANGAR_HOME = hangarHome
      await rm(empty, { recursive: true, force: true })
    }
  })
})
