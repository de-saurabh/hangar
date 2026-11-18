import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { discover, read } from '../src/sources/claudeMd.js'

const FIXTURES = resolve(import.meta.dirname, '../../../test/fixtures')
const claudeHome = join(FIXTURES, 'claude-home')
const repoPath = join(FIXTURES, 'repo-demo')

describe('CLAUDE.md adapter', () => {
  it('lists files in load order: user, project, local, nested', async () => {
    const files = await read({ claudeHome, repoPath })
    expect(files.map((f) => [f.kind, f.exists])).toEqual([
      ['user', true],
      ['project', true],
      ['local', true],
      ['nested', true],
    ])
    expect(files[3]).toMatchObject({ label: 'repo-demo/src/db/CLAUDE.md', scopeDir: 'src/db' })
  })

  it('ignores dot-dirs and vendored dirs when looking for nested files', async () => {
    const nested = (await discover({ claudeHome, repoPath })).filter((t) => t.kind === 'nested')
    expect(nested.map((t) => t.scopeDir)).toEqual(['src/db'])
  })

  it('reports size stats and a token estimate, never content', async () => {
    const project = (await read({ claudeHome, repoPath })).find((f) => f.kind === 'project')
    expect(project?.bytes).toBeGreaterThan(0)
    expect(project?.lines).toBeGreaterThan(0)
    expect(project?.tokens).toBe(Math.ceil((project?.bytes ?? 0) / 4))
    expect(project?.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(JSON.stringify(project)).not.toContain('Use npm for scripts')
  })

  it('marks missing files as not existing instead of failing', async () => {
    const files = await read({ claudeHome: join(FIXTURES, 'nowhere'), repoPath: join(FIXTURES, 'repo-broken') })
    expect(files.map((f) => f.exists)).toEqual([false, false, false])
  })

  describe('limits', () => {
    let dir: string
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'hangar-md-'))
    })
    afterEach(() => rm(dir, { recursive: true, force: true }))

    it('flags a file over 1 MB without reading it', async () => {
      await writeFile(join(dir, 'CLAUDE.md'), 'x'.repeat(1_000_001))
      const project = (await read({ claudeHome: dir, repoPath: dir })).find((f) => f.kind === 'project')
      expect(project).toMatchObject({ exists: true, error: 'File too large to analyse' })
      expect(project?.tokens).toBeUndefined()
    })

    it('stops looking for nested files beyond the depth limit', async () => {
      const deep = join(dir, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h')
      await mkdir(deep, { recursive: true })
      await writeFile(join(deep, 'CLAUDE.md'), '# too deep')
      await mkdir(join(dir, 'a', 'ok'), { recursive: true })
      await writeFile(join(dir, 'a', 'ok', 'CLAUDE.md'), '# ok')
      const nested = (await discover({ claudeHome: dir, repoPath: dir })).filter((t) => t.kind === 'nested')
      expect(nested.map((t) => t.scopeDir)).toEqual(['a/ok'])
    })

    it('treats an empty file as 0 lines and 0 tokens', async () => {
      await writeFile(join(dir, 'CLAUDE.md'), '')
      const project = (await read({ claudeHome: dir, repoPath: dir })).find((f) => f.kind === 'project')
      expect(project).toMatchObject({ exists: true, lines: 0, tokens: 0 })
    })
  })
})

describe('GET /api/repos/:id/memory', () => {
  let home: string
  let server: Server
  let base: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'hangar-home-'))
    process.env.HANGAR_HOME = home
    server = createApp({ version: 'test', claudeHome }).listen(0, '127.0.0.1')
    await new Promise((r) => server.once('listening', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await new Promise((r) => server.close(r))
    delete process.env.HANGAR_HOME
    await rm(home, { recursive: true, force: true })
  })

  it('returns memory files for a registered repo, 404 for unknown', async () => {
    const add = await fetch(`${base}/api/repos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: repoPath }),
    })
    const repo = (await add.json()) as { id: string }
    const res = await fetch(`${base}/api/repos/${repo.id}/memory`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { kind: string }[]).map((f) => f.kind)).toEqual(['user', 'project', 'local', 'nested'])
    expect((await fetch(`${base}/api/repos/nope/memory`)).status).toBe(404)
  })
})
