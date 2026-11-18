import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LibraryItem } from '@hangar/shared'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

let hh: string
let claude: string
let repo: string
let server: Server
let base: string
let repoId: string
const w = async (p: string, t: string | Buffer) => {
  await mkdir(join(p, '..'), { recursive: true })
  await writeFile(p, t)
}
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const lib = async () => ((await (await fetch(`${base}/api/library`)).json()) as { items: LibraryItem[] }).items

beforeEach(async () => {
  hh = await mkdtemp(join(tmpdir(), 'hangar-lch-'))
  claude = await mkdtemp(join(tmpdir(), 'hangar-lcc-'))
  repo = await mkdtemp(join(tmpdir(), 'hangar-lcr-'))
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

describe('library copy', () => {
  it('copies a global command into a repo only after preview + token, and back is a no-op when identical', async () => {
    await w(join(claude, 'commands', 'team', 'deploy.md'), 'Ship it\n')
    const item = (await lib()).find((i) => i.name === 'team/deploy')!
    const body = { itemId: item.id, scope: 'repo', repoId }
    const p = await (await post('/api/library/copy/preview', body)).json()
    expect(p.files).toMatchObject([{ status: 'new' }])
    expect(await readdir(repo)).toEqual([]) // preview writes nothing

    expect((await post('/api/library/copy/apply', { ...body, token: p.token })).status).toBe(200)
    expect(await readFile(join(repo, '.claude', 'commands', 'team', 'deploy.md'), 'utf8')).toBe('Ship it\n')

    const repoItem = (await lib()).find((i) => i.scope === 'repo')!
    const back = await (await post('/api/library/copy/preview', { itemId: repoItem.id, scope: 'global' })).json()
    expect(back.files).toMatchObject([{ status: 'same' }])
  })

  it('shows a diff and backs up when overwriting a different file', async () => {
    await w(join(claude, 'commands', 'a.md'), 'new\n')
    await w(join(repo, '.claude', 'commands', 'a.md'), 'old\n')
    const item = (await lib()).find((i) => i.scope === 'user')!
    const body = { itemId: item.id, scope: 'repo', repoId }
    const p = await (await post('/api/library/copy/preview', body)).json()
    expect(p.files[0].status).toBe('changed')
    expect(p.files[0].diff).toMatch(/-old[\s\S]*\+new/)
    const r = await (await post('/api/library/copy/apply', { ...body, token: p.token })).json()
    expect(r.backupPaths).toHaveLength(1)
    expect(await readFile(r.backupPaths[0], 'utf8')).toBe('old\n')
  })

  it('copies a whole skill folder, and refuses binary files', async () => {
    await w(join(claude, 'skills', 'pdf', 'SKILL.md'), '---\nname: pdf\n---\n')
    await w(join(claude, 'skills', 'pdf', 'scripts', 'run.py'), 'print(1)\n')
    const item = (await lib()).find((i) => i.kind === 'skills')!
    const body = { itemId: item.id, scope: 'repo', repoId }
    const p = await (await post('/api/library/copy/preview', body)).json()
    expect(p.files).toHaveLength(2)
    expect((await post('/api/library/copy/apply', { ...body, token: p.token })).status).toBe(200)
    expect(await readFile(join(repo, '.claude', 'skills', 'pdf', 'scripts', 'run.py'), 'utf8')).toBe('print(1)\n')

    await w(join(claude, 'skills', 'pdf', 'logo.png'), Buffer.from([1, 0, 2]))
    const bad = await post('/api/library/copy/preview', body)
    expect(bad.status).toBe(422)
    expect((await bad.json()).error).toContain('binary')
  })

  it('refuses a stale token, same-location copies, unknown ids and bad bodies', async () => {
    await w(join(claude, 'commands', 'a.md'), 'x\n')
    const item = (await lib()).find((i) => i.kind === 'commands')!
    const body = { itemId: item.id, scope: 'repo', repoId }
    const p = await (await post('/api/library/copy/preview', body)).json()
    await w(join(repo, '.claude', 'commands', 'a.md'), 'appeared meanwhile\n')
    expect((await post('/api/library/copy/apply', { ...body, token: p.token })).status).toBe(409)
    expect((await post('/api/library/copy/preview', { itemId: item.id, scope: 'global' })).status).toBe(409)
    expect((await post('/api/library/copy/preview', { itemId: 'nope', scope: 'global' })).status).toBe(404)
    expect((await post('/api/library/copy/preview', { itemId: item.id, scope: 'repo', repoId: 'nope' })).status).toBe(404)
    expect((await post('/api/library/copy/preview', { scope: 'global' })).status).toBe(400)
    expect((await post('/api/library/copy/apply', body)).status).toBe(400)
  })
})
