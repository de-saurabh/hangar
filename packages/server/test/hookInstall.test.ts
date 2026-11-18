import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'jsonc-parser'
import { HOOK_EVENTS } from '@hangar/shared'
import { apply, computeInstall, computeUninstall, hookUrl, isInstalled, preview, SettingsParseError, StaleTokenError } from '../src/hookInstall.js'

const URL1 = hookUrl(4777)

describe('computeInstall / computeUninstall', () => {
  it('adds an http handler for every event and is idempotent', () => {
    const once = computeInstall('{ "theme": "dark" }', URL1)
    const twice = computeInstall(once, URL1)
    expect(twice).toBe(once)
    const s = JSON.parse(once)
    expect(s.theme).toBe('dark')
    expect(Object.keys(s.hooks).sort()).toEqual([...HOOK_EVENTS].sort())
    expect(s.hooks.Stop).toEqual([{ hooks: [{ type: 'http', url: URL1, timeout: 5 }] }])
    expect(isInstalled(once)).toBe(true)
  })

  it('keeps the user\'s own hooks, comments and formatting', () => {
    const src = `{
  // my settings
  "hooks": {
    "Stop": [ { "hooks": [ { "type": "command", "command": "notify.sh" } ] } ]
  },
  "theme": "dark" // keep
}
`
    const out = computeInstall(src, URL1)
    expect(out).toContain('// my settings')
    expect(out).toContain('// keep')
    const parsed = parse(out)
    expect(parsed.hooks.Stop).toHaveLength(2)
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe('notify.sh')
  })

  it('updates the port when reinstalling', () => {
    const moved = computeInstall(computeInstall('{}', hookUrl(4777)), hookUrl(4790))
    expect(moved).toContain(':4790/')
    expect(moved).not.toContain(':4777/')
  })

  it('uninstall removes only Hangar handlers and restores the original', () => {
    const original = '{\n  "theme": "dark"\n}\n'
    expect(JSON.parse(computeUninstall(computeInstall(original, URL1)))).toEqual({ theme: 'dark' })

    const mixed = `{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"notify.sh"}]}]}}`
    const roundTrip = JSON.parse(computeUninstall(computeInstall(mixed, URL1)))
    expect(roundTrip).toEqual({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'notify.sh' }] }] } })
  })

  it('does not touch a user handler that merely looks similar', () => {
    const src = `{"hooks":{"Stop":[{"hooks":[{"type":"http","url":"https://example.com/api/hook?src=hangar"}]}]}}`
    expect(isInstalled(src)).toBe(false)
    expect(computeUninstall(src)).toBe(src)
  })

  it('creates settings from nothing and refuses invalid JSON', () => {
    expect(isInstalled(computeInstall('', URL1))).toBe(true)
    expect(() => computeInstall('{ broken', URL1)).toThrow(SettingsParseError)
  })
})

describe('preview / apply', () => {
  let claude: string
  let hangar: string
  beforeEach(async () => {
    claude = await mkdtemp(join(tmpdir(), 'hangar-claude-'))
    hangar = await mkdtemp(join(tmpdir(), 'hangar-home-'))
    process.env.HANGAR_HOME = hangar
  })
  afterEach(async () => {
    delete process.env.HANGAR_HOME
    await rm(claude, { recursive: true, force: true })
    await rm(hangar, { recursive: true, force: true })
  })

  it('previews a diff without touching the file', async () => {
    const original = '{\n  "theme": "dark"\n}\n'
    await writeFile(join(claude, 'settings.json'), original)
    const p = await preview(claude, 4777)
    expect(p).toMatchObject({ exists: true, installed: false, action: 'install' })
    expect(p.diff).toMatch(/^\+\s+"type": "http"/m)
    expect(await readFile(join(claude, 'settings.json'), 'utf8')).toBe(original)
  })

  it('applies with a backup, then offers uninstall, then restores the original content', async () => {
    const original = '{\n  "theme": "dark"\n}\n'
    const file = join(claude, 'settings.json')
    await writeFile(file, original)

    const p1 = await preview(claude, 4777)
    const r1 = await apply(claude, 4777, 'install', p1.token)
    expect(r1.backupPath).toBeTruthy()
    expect(await readFile(r1.backupPath!, 'utf8')).toBe(original)
    expect(await readdir(join(hangar, 'backups'))).toHaveLength(1)

    const p2 = await preview(claude, 4777)
    expect(p2).toMatchObject({ installed: true, action: 'uninstall' })
    await apply(claude, 4777, 'uninstall', p2.token)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ theme: 'dark' })
  })

  it('refuses to write if the file changed after the preview', async () => {
    const file = join(claude, 'settings.json')
    await writeFile(file, '{}')
    const p = await preview(claude, 4777)
    await writeFile(file, '{"theme":"light"}')
    await expect(apply(claude, 4777, 'install', p.token)).rejects.toThrow(StaleTokenError)
    expect(await readFile(file, 'utf8')).toBe('{"theme":"light"}')
  })

  it('creates settings.json when none exists (no backup needed)', async () => {
    const p = await preview(claude, 4777)
    expect(p.exists).toBe(false)
    const r = await apply(claude, 4777, 'install', p.token)
    expect(r.backupPath).toBeUndefined()
    expect(isInstalled(await readFile(join(claude, 'settings.json'), 'utf8'))).toBe(true)
  })
})
