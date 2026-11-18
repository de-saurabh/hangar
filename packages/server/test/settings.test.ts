import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { effectiveSettings } from '@hangar/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'
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
    server = await listenSafe(createApp({ version: 'test', claudeHome }))
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

describe('hooks via the settings adapter', () => {
  it('merges hooks from user and project, collapsing the identical Stop hook', async () => {
    const eff = effectiveSettings(await read({ claudeHome, repoPath: join(FIXTURES, 'repo-demo') }))
    expect(eff.hooks.map((h) => `${h.event}${h.matcher ? ' · ' + h.matcher : ''}`).sort()).toEqual([
      'PostToolUse · Edit',
      'PreToolUse · Bash',
      'Stop',
    ])
    expect(eff.hooks.find((h) => h.event === 'Stop')?.sources).toEqual(['project', 'user'])
  })
})

describe('secret masking over the API', () => {
  let home: string
  let server: Server
  let base: string
  let repoId: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'hangar-home-'))
    process.env.HANGAR_HOME = home
    server = await listenSafe(createApp({ version: 'test', claudeHome }))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const add = await fetch(`${base}/api/repos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: join(FIXTURES, 'repo-demo') }),
    })
    repoId = ((await add.json()) as { id: string }).id
  })
  afterEach(async () => {
    await new Promise((r) => server.close(r))
    delete process.env.HANGAR_HOME
    await rm(home, { recursive: true, force: true })
  })

  it('never includes secret values in the settings response', async () => {
    const text = await (await fetch(`${base}/api/repos/${repoId}/settings`)).text()
    expect(text).not.toContain('FIXTURE-SETTINGS-SECRET')
    const apiKey = (JSON.parse(text) as { values: { key: string; masked?: boolean }[] }).values.find((v) => v.key === 'env.API_KEY')
    expect(apiKey?.masked).toBe(true)
  })

  it('reveals one value only on explicit request, uncached', async () => {
    const res = await fetch(`${base}/api/repos/${repoId}/settings/value?key=env.API_KEY&scope=user`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ value: 'FIXTURE-SETTINGS-SECRET' })
  })

  it('validates the reveal request', async () => {
    const get = (q: string) => fetch(`${base}/api/repos/${repoId}/settings/value?${q}`)
    expect((await get('key=env.API_KEY')).status).toBe(400) // no scope
    expect((await get('scope=user')).status).toBe(400) // no key
    expect((await get('key=env.API_KEY&scope=bogus')).status).toBe(400)
    expect((await get('key=env.NOPE&scope=user')).status).toBe(404)
    expect((await get('key=env.API_KEY&scope=project')).status).toBe(404) // not set at that level
    expect((await fetch(`${base}/api/repos/nope/settings/value?key=a&scope=user`)).status).toBe(404)
  })
})
