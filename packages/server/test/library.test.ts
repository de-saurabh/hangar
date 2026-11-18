import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Repo } from '@hangar/shared'
import { discoverFiles, discoverHooks, publicItem } from '../src/sources/library.js'

let claude: string
let repoDir: string
let repo: Repo
const w = async (p: string, text: string) => {
  await mkdir(join(p, '..'), { recursive: true })
  await writeFile(p, text)
}

beforeEach(async () => {
  claude = await mkdtemp(join(tmpdir(), 'hangar-lib-c-'))
  repoDir = await mkdtemp(join(tmpdir(), 'hangar-lib-r-'))
  repo = { id: 'r1', name: 'api', path: repoDir, addedAt: '' }
})
afterEach(async () => {
  for (const d of [claude, repoDir]) await rm(d, { recursive: true, force: true })
})

describe('discoverFiles', () => {
  it('finds commands (incl. namespaced), agents and skills in user and repo scopes', async () => {
    await w(join(claude, 'commands', 'deploy.md'), '---\ndescription: Ship it\n---\nrun deploy')
    await w(join(claude, 'commands', 'team', 'review.md'), '# Review a PR\nsteps')
    await w(join(claude, 'agents', 'qa.md'), '---\nname: qa-bot\ndescription: Tests things\n---\n')
    await w(join(claude, 'skills', 'pdf', 'SKILL.md'), '---\nname: pdf\ndescription: Make PDFs\n---\n')
    await w(join(claude, 'skills', 'pdf', 'helper.py'), 'print(1)')
    await w(join(claude, 'skills', 'synced', 'x', 'SKILL.md'), '---\nname: app-managed\n---\n') // app-managed: skipped
    await w(join(claude, 'skills', 'empty', 'notes.txt'), 'no SKILL.md') // not a skill
    await w(join(repoDir, '.claude', 'commands', 'lint.md'), 'Run the linter')

    const items = (await discoverFiles(claude, [repo])).map(publicItem)
    const brief = items.map((i) => `${i.scope}:${i.kind}:${i.name}:${i.description}`)
    expect(brief).toEqual([
      'user:commands:deploy:Ship it',
      'user:commands:team/review:Review a PR',
      'user:agents:qa-bot:Tests things',
      'user:skills:pdf:Make PDFs',
      'repo:commands:lint:Run the linter',
    ])
    expect(items.find((i) => i.name === 'lint')).toMatchObject({ repoId: 'r1', repoName: 'api', path: 'commands/lint.md', copyable: true })
    expect(JSON.stringify(items)).not.toContain('hangar-lib-c-') // no absolute paths leak to the browser
  })

  it('tolerates missing folders, unreadable names and symlinks', async () => {
    expect(await discoverFiles(join(claude, 'nope'), [repo])).toEqual([])
    await w(join(claude, 'real.md'), 'x')
    try {
      await symlink(join(claude, 'real.md'), join(claude, 'commands.md'))
    } catch {
      // symlinks may need privileges on Windows; nothing to assert then
    }
    expect(await discoverFiles(claude, [])).toEqual([])
  })

  it('gives each item a stable id', async () => {
    await w(join(claude, 'commands', 'a.md'), 'x')
    const [a] = await discoverFiles(claude, [])
    const [b] = await discoverFiles(claude, [])
    expect(a?.id).toBe(b?.id)
    expect(a?.id).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('discoverHooks', () => {
  it('lists user and repo hooks, redacted, as non-copyable', async () => {
    await w(join(claude, 'settings.json'), JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'prettier --write' }] }] } }))
    await w(join(repoDir, '.claude', 'settings.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'API_KEY=sk-abcdefghijklmnopqrstuvwx notify' }] }] } }))
    const hooks = await discoverHooks(claude, [repo])
    expect(hooks.map((h) => [h.scope, h.name, h.copyable])).toEqual([['user', 'PostToolUse · Edit', false], ['repo', 'Stop', false]])
    expect(JSON.stringify(hooks)).not.toContain('sk-abcdefghijklmnopqrstuvwx')
  })
})

import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

describe('GET /api/library', () => {
  it('returns items without server-only fields', async () => {
    const hh = await mkdtemp(join(tmpdir(), 'hangar-lib-h-'))
    process.env.HANGAR_HOME = hh
    await w(join(claude, 'commands', 'deploy.md'), 'Ship it')
    const server: Server = await listenSafe(createApp({ version: 't', claudeHome: claude }))
    try {
      const r = await (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/library`)).json()
      expect(r.items).toHaveLength(1)
      expect(r.items[0]).toMatchObject({ kind: 'commands', name: 'deploy', scope: 'user' })
      expect(r.items[0].abs).toBeUndefined()
      expect(r.items[0].home).toBeUndefined()
    } finally {
      server.closeAllConnections()
      await new Promise((res) => server.close(res))
      delete process.env.HANGAR_HOME
      await rm(hh, { recursive: true, force: true })
    }
  })
})
