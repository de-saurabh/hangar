import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyEdit, applyFiles, previewEdit, previewFiles, StaleTokenError } from '../src/settingsWrite.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hangar-write-'))
  process.env.HANGAR_HOME = join(dir, 'home')
})
afterEach(async () => {
  delete process.env.HANGAR_HOME
  await rm(dir, { recursive: true, force: true })
})

describe('previewEdit / applyEdit', () => {
  it('previews a diff without touching the file', async () => {
    const f = join(dir, 'settings.json')
    await writeFile(f, '{"a":1}\n')
    const p = await previewEdit(f, (t) => t.replace('1', '2'))
    expect(p.exists).toBe(true)
    expect(p.diff).toContain('-{"a":1}')
    expect(p.diff).toContain('+{"a":2}')
    expect(await readFile(f, 'utf8')).toBe('{"a":1}\n')
  })

  it('gives an empty diff when nothing would change', async () => {
    const f = join(dir, 's.json')
    await writeFile(f, 'same')
    expect((await previewEdit(f, (t) => t)).diff).toBe('')
  })

  it('backs up the old file, writes the new one, and leaves no temp file', async () => {
    const f = join(dir, 'settings.json')
    await writeFile(f, 'old')
    const { token } = await previewEdit(f, () => 'new')
    const { backupPath } = await applyEdit(f, () => 'new', token)
    expect(await readFile(f, 'utf8')).toBe('new')
    expect(await readFile(backupPath!, 'utf8')).toBe('old')
    expect((await readdir(dir)).filter((n) => n.endsWith('.hangar-tmp'))).toEqual([])
  })

  it('refuses when the file changed after the preview', async () => {
    const f = join(dir, 's.json')
    await writeFile(f, 'one')
    const { token } = await previewEdit(f, () => 'two')
    await writeFile(f, 'edited elsewhere')
    await expect(applyEdit(f, () => 'two', token)).rejects.toBeInstanceOf(StaleTokenError)
    expect(await readFile(f, 'utf8')).toBe('edited elsewhere')
  })

  it('creates a missing file (and its folder) without a backup', async () => {
    const f = join(dir, 'new', 'deep', 'CLAUDE.md')
    const p = await previewEdit(f, () => 'hello')
    expect(p.exists).toBe(false)
    expect(await applyEdit(f, () => 'hello', p.token)).toEqual({})
    expect(await readFile(f, 'utf8')).toBe('hello')
  })

  it('does nothing, and makes no backup, when the result is unchanged', async () => {
    const f = join(dir, 's.json')
    await writeFile(f, 'keep')
    const { token } = await previewEdit(f, (t) => t)
    expect(await applyEdit(f, (t) => t, token)).toEqual({})
  })
})

describe('previewFiles / applyFiles', () => {
  const edit = (path: string, to: string) => ({ path, compute: () => to })

  it('labels files new, changed or same', async () => {
    const a = join(dir, 'a'), b = join(dir, 'b'), c = join(dir, 'c')
    await writeFile(a, 'x')
    await writeFile(b, 'y')
    const p = await previewFiles([edit(a, 'x2'), edit(b, 'y'), edit(c, 'z')])
    expect(p.files.map((f) => f.status)).toEqual(['changed', 'same', 'new'])
  })

  it('writes only changed files, backing up the overwritten ones', async () => {
    const a = join(dir, 'a'), b = join(dir, 'b'), c = join(dir, 'sub', 'c')
    await writeFile(a, 'x')
    await writeFile(b, 'y')
    const edits = [edit(a, 'x2'), edit(b, 'y'), edit(c, 'z')]
    const { token } = await previewFiles(edits)
    const r = await applyFiles(edits, token)
    expect(r.written).toBe(2)
    expect(r.backupPaths).toHaveLength(1)
    expect(await readFile(r.backupPaths[0]!, 'utf8')).toBe('x')
    expect(await readFile(a, 'utf8')).toBe('x2')
    expect(await readFile(c, 'utf8')).toBe('z')
  })

  it('refuses everything if any file changed, and writes nothing', async () => {
    const a = join(dir, 'a'), b = join(dir, 'b')
    await writeFile(a, '1')
    await writeFile(b, '2')
    const edits = [edit(a, 'A'), edit(b, 'B')]
    const { token } = await previewFiles(edits)
    await writeFile(b, 'changed')
    await expect(applyFiles(edits, token)).rejects.toBeInstanceOf(StaleTokenError)
    expect(await readFile(a, 'utf8')).toBe('1')
  })

  it('treats a file that appeared after the preview as a change', async () => {
    const a = join(dir, 'a')
    const edits = [edit(a, 'A')]
    const { token } = await previewFiles(edits)
    await writeFile(a, 'someone made it')
    await expect(applyFiles(edits, token)).rejects.toBeInstanceOf(StaleTokenError)
  })
})
