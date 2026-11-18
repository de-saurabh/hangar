import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

let hh: string
let claude: string
let repo: string
let server: Server
let base: string
let repoId: string
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(async () => {
  hh = await mkdtemp(join(tmpdir(), 'hangar-th-'))
  claude = await mkdtemp(join(tmpdir(), 'hangar-tc-'))
  repo = await mkdtemp(join(tmpdir(), 'hangar-tr-'))
  process.env.HANGAR_HOME = hh
  server = await listenSafe(createApp({ version: 't', claudeHome: claude }))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const added = await (await post('/api/repos', { path: repo })).json()
  repoId = (added.repo ?? added).id
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  delete process.env.HANGAR_HOME
  for (const d of [hh, claude, repo]) await rm(d, { recursive: true, force: true })
})

describe('templates', () => {
  it('lists the built-in templates', async () => {
    const r = await (await fetch(`${base}/api/templates`)).json()
    expect(r.templates.map((t: { id: string }) => t.id)).toEqual(['node-service', 'learning-project'])
  })

  it('applies a template to an empty repo after a preview', async () => {
    const body = { templateId: 'node-service', repoId }
    const p = await (await post('/api/templates/preview', body)).json()
    expect(p.files.every((f: { status: string }) => f.status === 'new')).toBe(true)
    expect((await post('/api/templates/apply', { ...body, token: p.token })).status).toBe(200)
    expect(await readFile(join(repo, 'CLAUDE.md'), 'utf8')).toContain('npm test')
    expect(await readFile(join(repo, '.claude', 'commands', 'review.md'), 'utf8')).toContain('Review the uncommitted')
    expect(JSON.parse(await readFile(join(repo, '.claude', 'settings.json'), 'utf8')).permissions.allow).toContain('Bash(npm test:*)')
  })

  it('keeps an existing CLAUDE.md and merges into an existing settings.json without losing keys', async () => {
    await writeFile(join(repo, 'CLAUDE.md'), 'mine\n')
    await mkdir(join(repo, '.claude'), { recursive: true })
    await writeFile(join(repo, '.claude', 'settings.json'), '{\n  // keep me\n  "model": "opus",\n  "permissions": { "allow": ["Read"] }\n}\n')
    const body = { templateId: 'node-service', repoId }
    const p = await (await post('/api/templates/preview', body)).json()
    const byName = Object.fromEntries(p.files.map((f: { path: string; status: string }) => [f.path.split(/[\\/]/).pop(), f.status]))
    expect(byName['CLAUDE.md']).toBe('same')
    expect(byName['settings.json']).toBe('changed')
    await post('/api/templates/apply', { ...body, token: p.token })
    expect(await readFile(join(repo, 'CLAUDE.md'), 'utf8')).toBe('mine\n')
    const s = await readFile(join(repo, '.claude', 'settings.json'), 'utf8')
    expect(s).toContain('// keep me')
    expect(JSON.parse(s.replace('// keep me', '')).permissions.allow.slice(0, 2)).toEqual(['Read', 'Bash(npm test:*)'])
  })

  it('is idempotent: a second preview shows no changes', async () => {
    const body = { templateId: 'node-service', repoId }
    const p = await (await post('/api/templates/preview', body)).json()
    await post('/api/templates/apply', { ...body, token: p.token })
    const again = await (await post('/api/templates/preview', body)).json()
    expect(again.files.every((f: { status: string }) => f.status === 'same')).toBe(true)
  })

  it('validates input and refuses broken settings.json or a stale token', async () => {
    expect((await post('/api/templates/preview', { templateId: 'nope', repoId })).status).toBe(404)
    expect((await post('/api/templates/preview', { templateId: 'node-service', repoId: 'nope' })).status).toBe(404)
    expect((await post('/api/templates/apply', { templateId: 'node-service', repoId })).status).toBe(400)
    const p = await (await post('/api/templates/preview', { templateId: 'learning-project', repoId })).json()
    await writeFile(join(repo, 'CLAUDE.md'), 'appeared\n')
    expect((await post('/api/templates/apply', { templateId: 'learning-project', repoId, token: p.token })).status).toBe(409)
    await mkdir(join(repo, '.claude'), { recursive: true })
    await writeFile(join(repo, '.claude', 'settings.json'), '{ nope')
    expect((await post('/api/templates/preview', { templateId: 'node-service', repoId })).status).toBe(422)
  })
})
