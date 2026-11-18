import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { allowRules, computeAddRule } from '../src/allowlist.js'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

describe('computeAddRule', () => {
  it('creates permissions.allow in an empty or missing file', () => {
    expect(JSON.parse(computeAddRule('', 'Bash(npm test:*)'))).toEqual({ permissions: { allow: ['Bash(npm test:*)'] } })
  })

  it('appends to an existing list, keeping comments and other keys', () => {
    const before = '{\n  // my settings\n  "model": "opus",\n  "permissions": {\n    "allow": ["Read"],\n    "deny": ["Bash(rm:*)"]\n  }\n}\n'
    const after = computeAddRule(before, 'Bash(npm test:*)')
    expect(after).toContain('// my settings')
    expect(allowRules(after)).toEqual(['Read', 'Bash(npm test:*)'])
    expect(JSON.parse(after.replace('// my settings', '')).permissions.deny).toEqual(['Bash(rm:*)'])
  })

  it('is idempotent and rejects invalid rules and invalid files', () => {
    const once = computeAddRule('{}', 'Read')
    expect(computeAddRule(once, 'Read')).toBe(once)
    expect(() => computeAddRule('{}', 'Bash(')).toThrow()
    expect(() => computeAddRule('{ nope', 'Read')).toThrow()
  })
})

let hangarHome: string
let claude: string
let server: Server
let base: string

beforeEach(async () => {
  hangarHome = await mkdtemp(join(tmpdir(), 'hangar-alh-'))
  claude = await mkdtemp(join(tmpdir(), 'hangar-alc-'))
  process.env.HANGAR_HOME = hangarHome
  await writeFile(join(claude, 'settings.json'), '{\n  "model": "opus"\n}\n')
  server = await listenSafe(createApp({ version: 't', claudeHome: claude }))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  delete process.env.HANGAR_HOME
  for (const d of [hangarHome, claude]) await rm(d, { recursive: true, force: true })
})

const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const hook = (body: unknown) => post('/api/hook', body)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('allowlist routes', () => {
  it('suggests a hand-approved command after 3 approvals, and drops it once allowed', async () => {
    for (let i = 0; i < 3; i++) {
      await hook({ session_id: 's', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: '/x/y' })
      await hook({ session_id: 's', hook_event_name: 'PostToolUse', tool_name: 'Bash' })
    }
    await sleep(50)
    const list = async () => ((await (await fetch(`${base}/api/insights/allowlist`)).json()) as { suggestions: { rule: string }[] }).suggestions
    expect((await list()).map((s) => s.rule)).toEqual(['Bash(npm test:*)'])

    const p = await (await post('/api/insights/allowlist/preview', { rule: 'Bash(npm test:*)', scope: 'global' })).json()
    expect(p.diff).toContain('+')
    expect(p.diff).toContain('Bash(npm test:*)')
    expect(await readFile(join(claude, 'settings.json'), 'utf8')).not.toContain('npm test') // preview writes nothing

    const ok = await post('/api/insights/allowlist/apply', { rule: 'Bash(npm test:*)', scope: 'global', token: p.token })
    expect(ok.status).toBe(200)
    expect(JSON.parse(await readFile(join(claude, 'settings.json'), 'utf8'))).toEqual({ model: 'opus', permissions: { allow: ['Bash(npm test:*)'] } })
    expect(await readdir(join(hangarHome, 'backups'))).toHaveLength(1)
    expect(await list()).toEqual([])
  })

  it('refuses a stale token and leaves the file untouched', async () => {
    const p = await (await post('/api/insights/allowlist/preview', { rule: 'Read', scope: 'global' })).json()
    await writeFile(join(claude, 'settings.json'), '{ "model": "sonnet" }')
    const r = await post('/api/insights/allowlist/apply', { rule: 'Read', scope: 'global', token: p.token })
    expect(r.status).toBe(409)
    expect(await readFile(join(claude, 'settings.json'), 'utf8')).toBe('{ "model": "sonnet" }')
  })

  it('writes repo rules to the untracked settings.local.json', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'hangar-alr-'))
    try {
      await mkdir(join(repo, '.claude'), { recursive: true })
      const added = await (await post('/api/repos', { path: repo })).json()
      const id = (added.repo ?? added).id as string
      const p = await (await post('/api/insights/allowlist/preview', { rule: 'Bash(ls:*)', scope: 'repo', repoId: id })).json()
      expect((await post('/api/insights/allowlist/apply', { rule: 'Bash(ls:*)', scope: 'repo', repoId: id, token: p.token })).status).toBe(200)
      expect(JSON.parse(await readFile(join(repo, '.claude', 'settings.local.json'), 'utf8')).permissions.allow).toEqual(['Bash(ls:*)'])
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })

  it('validates input', async () => {
    expect((await post('/api/insights/allowlist/preview', { rule: 'Bash(', scope: 'global' })).status).toBe(422)
    expect((await post('/api/insights/allowlist/preview', { scope: 'global' })).status).toBe(400)
    expect((await post('/api/insights/allowlist/preview', { rule: 'Read', scope: 'repo', repoId: 'nope' })).status).toBe(404)
    expect((await post('/api/insights/allowlist/apply', { rule: 'Read', scope: 'global' })).status).toBe(400)
  })
})
