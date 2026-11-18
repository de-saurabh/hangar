import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkServer, commandExists, type Fetcher } from '../src/mcpCheck.js'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

const status = (code: number): Fetcher => async () => ({ status: code, body: null })

describe('checkServer (http)', () => {
  it('classifies reachable, auth-required, server error and invalid URLs', async () => {
    expect(await checkServer({ url: 'https://x.test/mcp' }, status(200))).toMatchObject({ ok: true, summary: 'Reachable (HTTP 200).' })
    expect(await checkServer({ url: 'https://x.test/mcp' }, status(405))).toMatchObject({ ok: true })
    expect((await checkServer({ url: 'https://x.test/mcp' }, status(401))).summary).toContain('asks for credentials')
    expect(await checkServer({ url: 'https://x.test/mcp' }, status(503))).toMatchObject({ ok: false })
    expect(await checkServer({ url: 'not a url' }, status(200))).toMatchObject({ ok: false })
    expect((await checkServer({ url: 'file:///etc/passwd' }, status(200))).summary).toContain('Unsupported URL scheme')
  })

  it('sends no credentials and does not follow redirects', async () => {
    let seen: { headers: Record<string, string>; redirect: string } | undefined
    await checkServer({ url: 'https://x.test/mcp?token=abc', headers: { Authorization: 'Bearer secret' } }, async (_u, init) => {
      seen = { headers: init.headers, redirect: init.redirect }
      return { status: 200 }
    })
    expect(Object.keys(seen!.headers)).toEqual(['Accept'])
    expect(seen!.redirect).toBe('manual')
  })

  it('reports connection failures without leaking the URL', async () => {
    const r = await checkServer({ url: 'https://secret-host.test/mcp?token=abc' }, async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    })
    expect(r).toMatchObject({ ok: false, summary: "Can't connect (ECONNREFUSED)." })
    expect(JSON.stringify(r)).not.toContain('secret-host')
  })

  it('times out via abort', async () => {
    const r = await checkServer({ url: 'https://x.test' }, (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))))
    expect(r.summary).toContain('No response within')
  }, 10_000)
})

describe('checkServer (stdio)', () => {
  it('finds node on PATH and reports a missing command, without running anything', async () => {
    expect(await commandExists('node')).toBe(true)
    expect(await commandExists('definitely-not-a-real-command-xyz')).toBe(false)
    expect(await checkServer({ command: 'node', args: ['-e', 'process.exit(7)'] })).toMatchObject({ ok: true })
    expect(await checkServer({ command: 'definitely-not-a-real-command-xyz' })).toMatchObject({ ok: false })
    expect(await checkServer({})).toMatchObject({ ok: false, summary: 'No command or URL configured.' })
  })
})

describe('POST /api/repos/:id/mcp/check', () => {
  let hh: string
  let claude: string
  let repo: string
  let server: Server
  let target: Server
  let base: string
  let repoId: string
  beforeEach(async () => {
    hh = await mkdtemp(join(tmpdir(), 'hangar-mh-'))
    claude = await mkdtemp(join(tmpdir(), 'hangar-mc-'))
    repo = await mkdtemp(join(tmpdir(), 'hangar-mr-'))
    process.env.HANGAR_HOME = hh
    target = createServer((_q, r) => r.writeHead(200).end('ok'))
    await new Promise<void>((r) => target.listen(0, '127.0.0.1', r))
    const port = (target.address() as AddressInfo).port
    await mkdir(dirname(join(repo, '.mcp.json')), { recursive: true })
    await writeFile(join(repo, '.mcp.json'), JSON.stringify({ mcpServers: { local_http: { type: 'http', url: `http://127.0.0.1:${port}/mcp?key=s3cret` }, tool: { command: 'node' } } }))
    server = await listenSafe(createApp({ version: 't', claudeHome: claude }))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const added = await (await fetch(`${base}/api/repos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: repo }) })).json()
    repoId = (added.repo ?? added).id
  })
  afterEach(async () => {
    for (const s of [server, target]) {
      s.closeAllConnections()
      await new Promise((r) => s.close(r))
    }
    delete process.env.HANGAR_HOME
    for (const d of [hh, claude, repo]) await rm(d, { recursive: true, force: true })
  })
  const check = (body: unknown) => fetch(`${base}/api/repos/${repoId}/mcp/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('checks a configured server by name and scope, returning only a summary', async () => {
    const r = await check({ name: 'local_http', scope: 'project' })
    const text = await r.text()
    expect(JSON.parse(text)).toMatchObject({ ok: true, summary: 'Reachable (HTTP 200).' })
    expect(text).not.toContain('s3cret')
    expect(text).not.toContain('127.0.0.1')
    expect((await (await check({ name: 'tool', scope: 'project' })).json()).ok).toBe(true)
  })

  it('validates input and 404s for unknown servers or repos', async () => {
    expect((await check({ name: 'nope', scope: 'project' })).status).toBe(404)
    expect((await check({ name: 'local_http', scope: 'user' })).status).toBe(404)
    expect((await check({ scope: 'project' })).status).toBe(400)
    expect((await check({ name: 'x', scope: 'bad' })).status).toBe(400)
    expect((await fetch(`${base}/api/repos/nope/mcp/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"a","scope":"user"}' })).status).toBe(404)
  })
})
