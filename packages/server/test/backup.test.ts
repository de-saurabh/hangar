import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupDir, runBackup, scrubSettings, status } from '../src/backup.js'

let hh: string
let claude: string
const w = async (p: string, t: string | Buffer) => {
  await mkdir(join(p, '..'), { recursive: true })
  await writeFile(p, t)
}
beforeEach(async () => {
  hh = await mkdtemp(join(tmpdir(), 'hangar-bh-'))
  claude = await mkdtemp(join(tmpdir(), 'hangar-bc-'))
  process.env.HANGAR_HOME = hh
})
afterEach(async () => {
  delete process.env.HANGAR_HOME
  for (const d of [hh, claude]) await rm(d, { recursive: true, force: true })
})

describe('scrubSettings', () => {
  it('drops env values and masks token-looking strings, keeping the rest', () => {
    const out = scrubSettings('{\n  // c\n  "model": "opus",\n  "env": { "MY_TOKEN": "supersecret123", "DEBUG": "1" },\n  "note": "sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD"\n}')
    expect(out).toContain('// c')
    expect(out).toContain('"model": "opus"')
    expect(out).not.toContain('supersecret123')
    expect(out).not.toContain('sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD')
    expect(out).toContain('<redacted>')
  })
})

describe('runBackup', () => {
  it('versions authored files, excludes sessions/credentials/synced skills, and commits only on change', async () => {
    await w(join(claude, 'CLAUDE.md'), 'rules\n')
    await w(join(claude, 'settings.json'), '{ "env": { "TOKEN": "abc-secret-value" } }')
    await w(join(claude, 'commands', 'a.md'), 'cmd\n')
    await w(join(claude, 'skills', 'mine', 'SKILL.md'), 'skill\n')
    await w(join(claude, 'skills', 'synced', 'x', 'SKILL.md'), 'managed\n')
    await w(join(claude, 'skills', 'mine', 'icon.png'), Buffer.from([0, 1, 2]))
    await w(join(claude, '.credentials.json'), '{"token":"nope"}')
    await w(join(claude, 'projects', 'p', 's.jsonl'), 'transcript secret\n')
    await w(join(claude, 'history.jsonl'), 'prompt history\n')

    expect(await status()).toEqual({ exists: false, versions: 0, history: [] })
    expect(await runBackup(claude)).toEqual({ changed: true, files: 4 })
    const dir = backupDir()
    expect((await readdir(dir)).sort()).toEqual(['.git', 'CLAUDE.md', 'commands', 'settings.json', 'skills'])
    expect(await readdir(join(dir, 'skills'))).toEqual(['mine'])
    expect(await readdir(join(dir, 'skills', 'mine'))).toEqual(['SKILL.md'])
    expect(await readFile(join(dir, 'settings.json'), 'utf8')).not.toContain('abc-secret-value')

    expect(await runBackup(claude)).toEqual({ changed: false, files: 4 })
    expect((await status()).versions).toBe(1)

    await rm(join(claude, 'commands', 'a.md'))
    await w(join(claude, 'CLAUDE.md'), 'rules v2\n')
    expect(await runBackup(claude)).toMatchObject({ changed: true })
    const s = await status()
    expect(s.versions).toBe(2)
    expect(s.exists).toBe(true)
    expect(s.history[0]?.subject).toMatch(/^Backup /)
    await expect(readFile(join(dir, 'commands', 'a.md'), 'utf8')).rejects.toThrow() // deletion recorded
  })

  it('works when ~/.claude is empty or missing', async () => {
    expect(await runBackup(join(claude, 'nope'))).toEqual({ changed: false, files: 0 })
  })
})
