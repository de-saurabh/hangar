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
