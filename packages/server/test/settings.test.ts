import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { effectiveSettings } from '@hangar/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { discover, read } from '../src/sources/settings.js'

const FIXTURES = resolve(import.meta.dirname, '../../../test/fixtures')
const claudeHome = join(FIXTURES, 'claude-home')

describe('settings adapter', () => {
  it('discovers all four layers for a repo, only user+managed without one', () => {
    expect(discover({ claudeHome, repoPath: '/r' }).map((l) => l.scope)).toEqual(['managed', 'user', 'project', 'local'])
    expect(discover({ claudeHome }).map((l) => l.scope)).toEqual(['managed', 'user'])
  })

  it('reads JSONC (comments, trailing comma) and keeps unknown keys', async () => {
    const layers = await read({ claudeHome })
    const user = layers.find((l) => l.scope === 'user')
    expect(user?.error).toBeUndefined()
    expect(user?.data).toMatchObject({ model: 'sonnet', someFutureKey: { nested: true } })
  })

  it('fails soft: missing files are not errors, invalid JSON gives a short error and no data', async () => {
    const missing = (await read({ claudeHome, repoPath: join(FIXTURES, 'repo-demo') })).find((l) => l.scope === 'managed')
    expect(missing).toMatchObject({ exists: false })

    const broken = (await read({ claudeHome, repoPath: join(FIXTURES, 'repo-broken') })).find((l) => l.scope === 'project')
    expect(broken).toMatchObject({ exists: true, error: 'Invalid JSON' })
    expect(broken?.data).toBeUndefined()
  })

  it('produces the expected effective config for the demo repo', async () => {
    const eff = effectiveSettings(await read({ claudeHome, repoPath: join(FIXTURES, 'repo-demo') }))
    const get = (k: string) => eff.values.find((v) => v.key === k)
    expect(get('model')).toMatchObject({ value: 'opus', source: 'project', overrides: [{ source: 'user', value: 'sonnet' }] })
    expect(get('permissions.defaultMode')).toMatchObject({ value: 'acceptEdits', source: 'local' })
    expect(get('env.NODE_ENV')).toMatchObject({ value: 'development', source: 'project' })
    expect(eff.permissions.allow.map((r) => r.rule)).toEqual(['Bash(npm install:*)', 'Bash(npm test:*)', 'Edit(src/**)', 'Bash(git status)'])
    expect(eff.permissions.allow.find((r) => r.rule === 'Bash(npm test:*)')?.sources).toEqual(['project', 'user'])
  })
})

describe('GET /api/repos/:id/settings', () => {
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

  it('returns effective settings for a registered repo, 404 for unknown', async () => {
    const add = await fetch(`${base}/api/repos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: join(FIXTURES, 'repo-demo') }),
    })
    const repo = (await add.json()) as { id: string }
    const res = await fetch(`${base}/api/repos/${repo.id}/settings`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { values: { key: string }[]; layers: { scope: string }[] }
    expect(body.layers.map((l) => l.scope)).toEqual(['managed', 'user', 'project', 'local'])
    expect(body.values.some((v) => v.key === 'model')).toBe(true)

    expect((await fetch(`${base}/api/repos/nope/settings`)).status).toBe(404)
  })
})
