import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'
import { configPath } from '../src/config.js'

let home: string
let repoDir: string
let server: Server
let base: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'hangar-home-'))
  repoDir = await mkdtemp(join(tmpdir(), 'hangar-repo-'))
  process.env.HANGAR_HOME = home
  server = await listenSafe(createApp({ version: 'test' }))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise((r) => server.close(r))
  delete process.env.HANGAR_HOME
  await rm(home, { recursive: true, force: true })
  await rm(repoDir, { recursive: true, force: true })
})

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('api', () => {
  it('reports health', async () => {
    const res = await fetch(`${base}/api/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, version: 'test' })
  })

  it('starts with no repos', async () => {
    expect(await (await fetch(`${base}/api/repos`)).json()).toEqual([])
  })

  it('adds, lists and removes a repo', async () => {
    const added = await fetch(`${base}/api/repos`, json({ path: repoDir }))
    expect(added.status).toBe(201)
    const repo = (await added.json()) as { id: string; path: string }

    const list = (await (await fetch(`${base}/api/repos`)).json()) as Array<{ id: string; exists: boolean }>
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: repo.id, exists: true })

    expect((await fetch(`${base}/api/repos/${repo.id}`, { method: 'DELETE' })).status).toBe(204)
    expect(await (await fetch(`${base}/api/repos`)).json()).toEqual([])
  })

  it('rejects duplicates, missing folders, bad bodies and unknown ids', async () => {
    await fetch(`${base}/api/repos`, json({ path: repoDir }))
    expect((await fetch(`${base}/api/repos`, json({ path: repoDir }))).status).toBe(409)
    expect((await fetch(`${base}/api/repos`, json({ path: join(repoDir, 'nope') }))).status).toBe(400)
    expect((await fetch(`${base}/api/repos`, json({ nope: 1 }))).status).toBe(400)
    expect((await fetch(`${base}/api/repos/abc`, { method: 'DELETE' })).status).toBe(404)
  })

  it('returns JSON 404 for unknown api routes', async () => {
    const res = await fetch(`${base}/api/nope`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })
})

describe('loopback guard', () => {
  it('rejects a non-loopback Host header', async () => {
    const { request } = await import('node:http')
    const port = new URL(base).port
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/api/health', headers: { host: 'evil.example' } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.end()
    })
    expect(status).toBe(403)
  })

  it('rejects a cross-site Origin', async () => {
    const res = await fetch(`${base}/api/repos`, {
      ...json({ path: repoDir }),
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
  })
})

describe('config file', () => {
  it('backs up a corrupt config instead of overwriting it', async () => {
    await mkdir(home, { recursive: true })
    await writeFile(configPath(), '{ not json')
    const res = await fetch(`${base}/api/repos`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    const files = await readdir(home)
    expect(files.some((f) => f.startsWith('config.json.corrupt-'))).toBe(true)
  })

  it('preserves unknown fields across a save', async () => {
    await mkdir(home, { recursive: true })
    await writeFile(configPath(), JSON.stringify({ version: 1, repos: [], future: { a: 1 } }))
    await fetch(`${base}/api/repos`, json({ path: repoDir }))
    const saved = JSON.parse(await (await import('node:fs/promises')).readFile(configPath(), 'utf8'))
    expect(saved.future).toEqual({ a: 1 })
    expect(saved.repos).toHaveLength(1)
  })
})
