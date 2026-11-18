import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { isInside, type Repo } from '@hangar/shared'
import type { FileEdit } from './settingsWrite.js'
import type { LibrarySource } from './sources/library.js'

export class CopyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 422 = 422,
  ) {
    super(message)
  }
}

const MAX_FILES = 50
const MAX_FILE_BYTES = 1_000_000

export type CopyTarget = { scope: 'global' } | { scope: 'repo'; repo: Repo }

/** The `.claude` folder a copy lands in. */
export const targetHome = (claudeHome: string, t: CopyTarget): string => (t.scope === 'global' ? claudeHome : join(t.repo.path, '.claude'))

async function skillFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  async function walk(d: string, depth: number): Promise<void> {
    if (depth > 5) throw new CopyError('Skill folder is nested too deeply to copy.')
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isSymbolicLink()) continue
      const p = join(d, e.name)
      if (e.isDirectory()) await walk(p, depth + 1)
      else if (e.isFile()) out.push(p)
      if (out.length > MAX_FILES) throw new CopyError(`Skill has more than ${MAX_FILES} files; copy it by hand.`)
    }
  }
  await walk(dir, 0)
  return out
}

async function readTextFile(path: string): Promise<string> {
  if ((await stat(path)).size > MAX_FILE_BYTES) throw new CopyError(`${relative(resolve(path, '..'), path)} is too large to copy.`)
  const buf = await readFile(path)
  if (buf.includes(0)) throw new CopyError(`${relative(resolve(path, '..'), path)} is a binary file; copy this skill by hand.`)
  return buf.toString('utf8')
}

/**
 * The files a copy would write. Sources come only from discovery (never a
 * client path) and every destination is checked to stay inside the target.
 */
export async function planCopy(item: LibrarySource, claudeHome: string, target: CopyTarget): Promise<FileEdit[]> {
  if (item.kind === 'hooks') throw new CopyError('Hooks can’t be copied yet.', 400)
  const destHome = targetHome(claudeHome, target)
  const kindDir = join(destHome, item.kind)
  const srcKindDir = join(item.home, item.kind)

  if (resolve(item.home) === resolve(destHome)) throw new CopyError('It is already there.', 409)

  const pairs: { src: string; dest: string }[] = []
  if (item.kind === 'skills') {
    for (const f of await skillFiles(item.abs)) pairs.push({ src: f, dest: join(kindDir, relative(srcKindDir, f)) })
  } else {
    pairs.push({ src: item.abs, dest: join(kindDir, relative(srcKindDir, item.abs)) })
  }

  const edits: FileEdit[] = []
  for (const { src, dest } of pairs) {
    if (!isInside(resolve(dest), resolve(kindDir)) || relative(resolve(kindDir), resolve(dest)).split(sep).includes('..')) throw new CopyError('Unsafe destination path.', 400)
    const text = await readTextFile(src)
    edits.push({ path: dest, compute: () => text })
  }
  return edits
}
