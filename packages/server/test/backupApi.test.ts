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
let server: Server
let base: string
beforeEach(async () => {
  hh = await mkdtemp(join(tmpdir(), 'hangar-bah-'))
  claude = await mkdtemp(join(tmpdir(), 'hangar-bac-'))
  process.env.HANGAR_HOME = hh
  server = await listenSafe(createApp({ version: 't', claudeHome: claude }))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  delete process.env.HANGAR_HOME
  for (const d of [hh, claude]) await rm(d, { recursive: true, force: true })
})

describe('backup routes', () => {
  it('reports no backup, runs one on POST only, then reports history', async () => {
    expect(await (await fetch(`${base}/api/backup`)).json()).toEqual({ exists: false, versions: 0, history: [] })
    await mkdir(join(claude, 'commands'), { recursive: true })
    await writeFile(join(claude, 'commands', 'a.md'), 'x\n')
    expect((await fetch(`${base}/api/backup`)).status).toBe(200)
    expect((await (await fetch(`${base}/api/backup`)).json()).exists).toBe(false) // GET never creates it

    const run = await fetch(`${base}/api/backup/run`, { method: 'POST' })
    expect(await run.json()).toEqual({ changed: true, files: 1 })
    const s = await (await fetch(`${base}/api/backup`)).json()
    expect(s).toMatchObject({ exists: true, versions: 1 })
    expect(s.history).toHaveLength(1)
    expect(await (await fetch(`${base}/api/backup/run`, { method: 'POST' })).json()).toEqual({ changed: false, files: 1 })
  })
})
