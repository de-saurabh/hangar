import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
beforeEach(async () => {
  hh = await mkdtemp(join(tmpdir(), 'hangar-sh-'))
  claude = await mkdtemp(join(tmpdir(), 'hangar-sc-'))
  repo = await mkdtemp(join(tmpdir(), 'hangar-sr-'))
  process.env.HANGAR_HOME = hh
  server = await listenSafe(createApp({ version: 't', claudeHome: claude }))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  delete process.env.HANGAR_HOME
  for (const d of [hh, claude, repo]) await rm(d, { recursive: true, force: true })
})

const addRepo = async () => {
  const r = await (await fetch(`${base}/api/repos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: repo }) })).json()
  return (r.repo ?? r).id as string
}

describe('GET /api/repos/:id/secrets', () => {
  it('reports file, line and kind, never the value, and marks committed files as shared', async () => {
    await mkdir(join(repo, '.claude'), { recursive: true })
    const secret = `sk-ant-${'z'.repeat(40)}`
    await writeFile(join(repo, '.mcp.json'), `{\n  "env": { "KEY": "${secret}" }\n}\n`)
    await writeFile(join(repo, '.claude', 'settings.local.json'), '{ "env": { "DB_PASSWORD": "hunter2hunter2" } }')
    await writeFile(join(claude, 'settings.json'), '{ "model": "opus" }')
    const id = await addRepo()
    const raw = await (await fetch(`${base}/api/repos/${id}/secrets`)).text()
    expect(raw).not.toContain(secret)
    expect(raw).not.toContain('hunter2')
    const r = JSON.parse(raw)
    expect(r.filesChecked).toBe(3)
    expect(r.findings).toEqual([
      { line: 2, kind: 'Anthropic key', file: expect.stringContaining('.mcp.json'), shared: true },
      { line: 1, kind: 'Password or token assignment', file: expect.stringContaining('settings.local.json'), shared: false },
    ])
  })

  it('404s for unknown repos and is clean for an empty repo', async () => {
    expect((await fetch(`${base}/api/repos/nope/secrets`)).status).toBe(404)
    const id = await addRepo()
    expect(await (await fetch(`${base}/api/repos/${id}/secrets`)).json()).toEqual({ findings: [], filesChecked: 0 })
  })
})
