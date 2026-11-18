import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { createTwoFilesPatch } from 'diff'
import { hangarHome } from './config.js'

/**
 * The single, shared path for every write Hangar makes to a Claude Code file:
 * preview a diff, hand back a token (hash of the file the user saw), and on
 * apply refuse if the file changed, back it up, then rename a temp file in.
 */
export class StaleTokenError extends Error {}

export const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

export async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw e
  }
}

export interface EditPreview {
  path: string
  exists: boolean
  /** Unified diff of the proposed change. Empty when nothing would change. */
  diff: string
  /** Hash of the current file; send it back to confirm you saw this diff. */
  token: string
}

export async function previewEdit(path: string, compute: (text: string) => string): Promise<EditPreview> {
  const current = await readText(path)
  const text = current ?? ''
  const after = compute(text)
  const name = basename(path)
  return {
    path,
    exists: current !== undefined,
    diff: after === text ? '' : createTwoFilesPatch(`${name} (current)`, `${name} (proposed)`, text, after, '', '', { context: 3 }),
    token: sha(text),
  }
}

export async function applyEdit(path: string, compute: (text: string) => string, token: string): Promise<{ backupPath?: string }> {
  const current = await readText(path)
  const text = current ?? ''
  if (sha(text) !== token) throw new StaleTokenError(`${basename(path)} changed since the preview. Review the new diff and try again.`)

  const next = compute(text)
  if (next === text) return {}

  let backupPath: string | undefined
  if (current !== undefined) {
    const dir = join(hangarHome(), 'backups')
    await mkdir(dir, { recursive: true })
    backupPath = join(dir, `${basename(path)}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`)
    await copyFile(path, backupPath)
  } else {
    await mkdir(dirname(path), { recursive: true })
  }
  const tmp = `${path}.hangar-tmp`
  await writeFile(tmp, next, 'utf8')
  await rename(tmp, path)
  return backupPath ? { backupPath } : {}
}

/** One file in a multi-file write. `compute` maps the current text (undefined if missing) to the new text. */
export interface FileEdit {
  path: string
  compute: (current: string | undefined) => string
}

export interface FilePreview {
  path: string
  status: 'new' | 'changed' | 'same'
  diff: string
}

export interface FilesPreview {
  files: FilePreview[]
  /** Hash of every file's current state; send it back to confirm you saw this diff. */
  token: string
}

const ABSENT = '\0absent'

async function snapshot(edits: FileEdit[]) {
  const states = await Promise.all(edits.map(async (e) => ({ e, current: await readText(e.path) })))
  const token = sha(states.map((s) => `${s.e.path}\0${s.current === undefined ? ABSENT : sha(s.current)}`).join('\n'))
  return { states, token }
}

export async function previewFiles(edits: FileEdit[]): Promise<FilesPreview> {
  const { states, token } = await snapshot(edits)
  const files = states.map(({ e, current }): FilePreview => {
    const next = e.compute(current)
    const text = current ?? ''
    const name = basename(e.path)
    if (current !== undefined && next === current) return { path: e.path, status: 'same', diff: '' }
    return { path: e.path, status: current === undefined ? 'new' : 'changed', diff: createTwoFilesPatch(`${name} (current)`, `${name} (proposed)`, text, next, '', '', { context: 3 }) }
  })
  return { files, token }
}

/** Writes every changed file. Refuses if anything changed since the preview; backs up files it overwrites. */
export async function applyFiles(edits: FileEdit[], token: string): Promise<{ written: number; backupPaths: string[] }> {
  const { states, token: now } = await snapshot(edits)
  if (now !== token) throw new StaleTokenError('Files changed since the preview. Review the new diff and try again.')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPaths: string[] = []
  let written = 0
  for (const { e, current } of states) {
    const next = e.compute(current)
    if (current !== undefined && next === current) continue
    if (current !== undefined) {
      const dir = join(hangarHome(), 'backups', stamp)
      await mkdir(dir, { recursive: true })
      const b = join(dir, `${sha(e.path).slice(0, 8)}-${basename(e.path)}`)
      await copyFile(e.path, b)
      backupPaths.push(b)
    }
    await mkdir(dirname(e.path), { recursive: true })
    const tmp = `${e.path}.hangar-tmp`
    await writeFile(tmp, next, 'utf8')
    await rename(tmp, e.path)
    written++
  }
  return { written, backupPaths }
}
