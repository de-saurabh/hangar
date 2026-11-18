import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { read } from '../src/sources/mcp.js'

const FIXTURES = resolve(import.meta.dirname, '../../../test/fixtures')
const claudeJsonPath = join(FIXTURES, 'claude-home', '.claude.json')
const repoPath = join(FIXTURES, 'repo-demo')

const SECRETS = ['FIXTURE-ARG-SECRET', 'FIXTURE-ENV-SECRET', 'FIXTURE-QUERY-SECRET', 'FIXTURE-HEADER-SECRET', 'FIXTURE-DB-SECRET', 'FIXTURE-ACCOUNT-SECRET', 'fixture-user@example.invalid']

describe('MCP adapter', () => {
  it('reads user servers from ~/.claude.json and project servers from .mcp.json', async () => {
    const { servers, sources } = await read({ claudeJsonPath, repoPath })
    expect(servers.map((s) => [s.name, s.scope, s.transport])).toEqual([
      ['postgres', 'project', 'stdio'],
      ['github', 'user', 'stdio'],
      ['linear', 'user', 'http'],
    ])
    expect(servers.find((s) => s.name === 'github')).toMatchObject({ command: 'npx', argCount: 4, envKeys: ['GITHUB_TOKEN'] })
    expect(servers.find((s) => s.name === 'linear')?.url).toBe('https://mcp.example.invalid/sse')
    expect(sources.map((s) => [s.scope, s.exists])).toEqual([['user', true], ['local', true], ['project', true]])
  })

  it('never returns secrets or unrelated account data from ~/.claude.json', async () => {
    const json = JSON.stringify(await read({ claudeJsonPath, repoPath }))
    for (const secret of SECRETS) expect(json).not.toContain(secret)
    expect(json).not.toContain('oauthAccount')
  })

  describe('local scope and edge cases', () => {
    let dir: string
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'hangar-mcp-'))
    })
    afterEach(() => rm(dir, { recursive: true, force: true }))

    it('matches projects[repo] despite forward-slash keys and trailing slashes', async () => {
      const key = repoPath.replace(/\\/g, '/') + '/'
      const file = join(dir, '.claude.json')
      await writeFile(
        file,
        JSON.stringify({
          projects: { [key]: { mcpServers: { scratch: { command: 'x' } }, enabledMcpjsonServers: ['postgres'] } },
        }),
      )
      const { servers } = await read({ claudeJsonPath: file, repoPath })
      expect(servers.map((s) => [s.name, s.scope, s.approval])).toEqual([
        ['scratch', 'local', undefined],
        ['postgres', 'project', 'approved'],
      ])
    })

    it('fails soft: missing ~/.claude.json is fine, invalid JSON is reported without content', async () => {
      const missing = await read({ claudeJsonPath: join(dir, 'nope.json'), repoPath })
      expect(missing.sources[0]).toMatchObject({ scope: 'user', exists: false })
      expect(missing.servers.map((s) => s.name)).toEqual(['postgres']) // .mcp.json still works

      const bad = join(dir, 'bad.json')
      await writeFile(bad, '{ "mcpServers": { "a": FIXTURE-BROKEN-SECRET')
      const result = await read({ claudeJsonPath: bad, repoPath })
      expect(result.sources[0]).toMatchObject({ exists: true, error: 'Invalid JSON' })
      expect(JSON.stringify(result)).not.toContain('FIXTURE-BROKEN-SECRET')
    })
  })
})

describe('GET /api/repos/:id/mcp', () => {
  let home: string
  let server: Server
  let base: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'hangar-home-'))
    process.env.HANGAR_HOME = home
    server = createApp({ version: 'test', claudeHome: join(FIXTURES, 'claude-home') }).listen(0, '127.0.0.1')
    await new Promise((r) => server.once('listening', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await new Promise((r) => server.close(r))
    delete process.env.HANGAR_HOME
    await rm(home, { recursive: true, force: true })
  })

  it('returns servers for a registered repo, 404 for unknown, and leaks no secrets', async () => {
    const add = await fetch(`${base}/api/repos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: repoPath }),
    })
    const repo = (await add.json()) as { id: string }
    const res = await fetch(`${base}/api/repos/${repo.id}/mcp`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text).servers).toHaveLength(3)
    for (const secret of SECRETS) expect(text).not.toContain(secret)
    expect((await fetch(`${base}/api/repos/nope/mcp`)).status).toBe(404)
  })
})
