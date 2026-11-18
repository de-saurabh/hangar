import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LintFinding } from '@hangar/shared'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

let hangarHome: string
let claude: string
let repo: string
let server: Server
let base: string

beforeEach(async () => {
  hangarHome = await mkdtemp(join(tmpdir(), 'hangar-lh-'))
  claude = await mkdtemp(join(tmpdir(), 'hangar-lc-'))
  repo = await mkdtemp(join(tmpdir(), 'hangar-lr-'))
  process.env.HANGAR_HOME = hangarHome
  server = await listenSafe(createApp({ version: 't', claudeHome: claude }))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  delete process.env.HANGAR_HOME
  for (const d of [hangarHome, claude, repo]) await rm(d, { recursive: true, force: true })
})

describe('GET /api/repos/:id/lint', () => {
  it('lints project, user and nested files together', async () => {
    await mkdir(join(repo, 'src'), { recursive: true })
    await writeFile(join(repo, 'src', 'app.ts'), '')
    await mkdir(join(repo, 'api'), { recursive: true })
    await writeFile(join(repo, 'CLAUDE.md'), 'Entry is `src/app.ts`, also `src/missing.ts`.\n- Never use var in TypeScript code.\n')
    await writeFile(join(repo, 'api', 'CLAUDE.md'), '- Always use var in TypeScript code.\nSee `../outside/thing.ts`.\n')
    await writeFile(join(claude, 'CLAUDE.md'), '- be nice\n')
    const added = await (await fetch(`${base}/api/repos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: repo }) })).json()
    const id = (added.repo ?? added).id as string

    const r = (await (await fetch(`${base}/api/repos/${id}/lint`)).json()) as { findings: LintFinding[]; filesChecked: number }
    expect(r.filesChecked).toBe(3)
    expect(r.findings.map((f) => f.rule).sort()).toEqual(['conflict', 'stale-path'])
    expect(r.findings.find((f) => f.rule === 'stale-path')?.message).toContain('src/missing.ts')
    // The finding text never includes file content beyond the quoted path/subject.
    expect(JSON.stringify(r)).not.toContain('be nice')
  })

  it('404s for an unknown repo and returns no findings for a repo without CLAUDE.md', async () => {
    expect((await fetch(`${base}/api/repos/nope/lint`)).status).toBe(404)
    const added = await (await fetch(`${base}/api/repos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: repo }) })).json()
    const r = await (await fetch(`${base}/api/repos/${(added.repo ?? added).id}/lint`)).json()
    expect(r).toEqual({ findings: [], filesChecked: 0 })
  })
})
