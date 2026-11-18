import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyFiles, previewFiles, StaleTokenError, type FileEdit } from '../src/settingsWrite.js'

let dir: string
let hh: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hangar-fw-'))
  hh = await mkdtemp(join(tmpdir(), 'hangar-fwh-'))
  process.env.HANGAR_HOME = hh
})
afterEach(async () => {
  delete process.env.HANGAR_HOME
  for (const d of [dir, hh]) await rm(d, { recursive: true, force: true })
})

const set = (path: string, text: string): FileEdit => ({ path, compute: () => text })

describe('previewFiles / applyFiles', () => {
  it('previews new, changed and unchanged files without writing', async () => {
    await writeFile(join(dir, 'old.md'), 'one\n')
    await writeFile(join(dir, 'same.md'), 'same\n')
    const p = await previewFiles([set(join(dir, 'new.md'), 'hello\n'), set(join(dir, 'old.md'), 'two\n'), set(join(dir, 'same.md'), 'same\n')])
    expect(p.files.map((f) => f.status)).toEqual(['new', 'changed', 'same'])
    expect(p.files[0]?.diff).toContain('+hello')
    expect(p.files[1]?.diff).toMatch(/-one[\s\S]*\+two/)
    expect(await readdir(dir)).toEqual(['old.md', 'same.md'])
  })

  it('writes with the token, backing up only overwritten files, creating folders', async () => {
    await writeFile(join(dir, 'old.md'), 'one\n')
    const edits = [set(join(dir, 'a', 'b', 'new.md'), 'x\n'), set(join(dir, 'old.md'), 'two\n')]
    const { token } = await previewFiles(edits)
    const r = await applyFiles(edits, token)
    expect(r.written).toBe(2)
    expect(r.backupPaths).toHaveLength(1)
    expect(await readFile(r.backupPaths[0]!, 'utf8')).toBe('one\n')
    expect(await readFile(join(dir, 'old.md'), 'utf8')).toBe('two\n')
    expect(await readFile(join(dir, 'a', 'b', 'new.md'), 'utf8')).toBe('x\n')
  })

  it('refuses a stale token and writes nothing', async () => {
    const edits = [set(join(dir, 'a.md'), 'x\n'), set(join(dir, 'b.md'), 'y\n')]
    const { token } = await previewFiles(edits)
    await writeFile(join(dir, 'b.md'), 'changed meanwhile\n')
    await expect(applyFiles(edits, token)).rejects.toBeInstanceOf(StaleTokenError)
    expect((await readdir(dir)).sort()).toEqual(['b.md'])
  })
})
