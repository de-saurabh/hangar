import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { applyEdits, modify, parse } from 'jsonc-parser'
import { redactText } from '@hangar/shared'
import { hangarHome } from './config.js'

const run = promisify(execFile)

export const backupDir = (): string => join(hangarHome(), 'claude-backup')

const MAX_FILE_BYTES = 1_000_000
const MAX_FILES = 500

async function git(args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', backupDir(), '-c', 'user.name=Hangar', '-c', 'user.email=hangar@localhost', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { timeout: 20_000, maxBuffer: 4_000_000, windowsHide: true })
  return stdout
}

/** settings.json with env values removed and token-looking strings masked. The backup is for history, not restore. */
export function scrubSettings(text: string): string {
  let out = text
  const obj = parse(text, [], { allowTrailingComma: true }) as unknown
  const env = typeof obj === 'object' && obj !== null ? (obj as { env?: unknown }).env : undefined
  if (typeof env === 'object' && env !== null && !Array.isArray(env)) {
    for (const key of Object.keys(env)) out = applyEdits(out, modify(out, ['env', key], '<redacted>', { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } }))
  }
  return redactText(out)
}

interface Collected {
  rel: string
  text: string
}

async function walkText(base: string, rel: string, out: Collected[], depth = 0): Promise<void> {
  if (depth > 6 || out.length > MAX_FILES) return
  let entries
  try {
    entries = await readdir(join(base, rel), { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isSymbolicLink()) continue
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (rel === 'skills' && (e.name === 'synced' || e.name.startsWith('.'))) continue // app-managed
      await walkText(base, r, out, depth + 1)
    } else if (e.isFile()) {
      try {
        const p = join(base, r)
        if ((await stat(p)).size > MAX_FILE_BYTES) continue
        const buf = await readFile(p)
        if (buf.includes(0)) continue
        out.push({ rel: r, text: buf.toString('utf8') })
      } catch {
        // unreadable: skip
      }
    }
  }
}

/** What goes into the backup: the files you author. Never sessions, history, credentials or plugin caches. */
export async function collect(claudeHome: string): Promise<Collected[]> {
  const out: Collected[] = []
  for (const name of ['CLAUDE.md', 'settings.json']) {
    try {
      const text = await readFile(join(claudeHome, name), 'utf8')
      out.push({ rel: name, text: name === 'settings.json' ? scrubSettings(text) : text })
    } catch {
      // absent
    }
  }
  for (const dir of ['commands', 'agents', 'skills']) await walkText(claudeHome, dir, out)
  return out
}

export interface BackupStatus {
  exists: boolean
  versions: number
  lastAt?: string
  history: { commit: string; date: string; subject: string }[]
}

export async function status(): Promise<BackupStatus> {
  try {
    await stat(join(backupDir(), '.git'))
  } catch {
    return { exists: false, versions: 0, history: [] }
  }
  try {
    const log = await git(['log', '-n', '30', '--pretty=format:%h%x09%ct%x09%s'])
    const history = log
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [commit = '', ct = '0', ...s] = l.split('\t')
        return { commit, date: new Date(Number(ct) * 1000).toISOString(), subject: s.join('\t') }
      })
    const versions = Number((await git(['rev-list', '--count', 'HEAD'])).trim()) || 0
    return { exists: true, versions, ...(history[0] ? { lastAt: history[0].date } : {}), history }
  } catch {
    return { exists: true, versions: 0, history: [] } // repo with no commits yet
  }
}

/** Mirrors the collected files into the backup repo and commits if anything changed. Writes only under ~/.hangar. */
export async function runBackup(claudeHome: string): Promise<{ changed: boolean; files: number }> {
  const dir = backupDir()
  await mkdir(dir, { recursive: true })
  try {
    await stat(join(dir, '.git'))
  } catch {
    await git(['init', '-q', '-b', 'main'])
  }
  const files = await collect(claudeHome)
  // Mirror: clear previous content (not .git) so deletions are recorded.
  for (const e of await readdir(dir)) if (e !== '.git') await rm(join(dir, e), { recursive: true, force: true })
  for (const f of files) {
    const dest = join(dir, f.rel)
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, f.text, 'utf8')
  }
  await git(['add', '-A'])
  if ((await git(['status', '--porcelain'])).trim() === '') return { changed: false, files: files.length }
  await git(['commit', '-q', '-m', `Backup ${new Date().toISOString()}`])
  return { changed: true, files: files.length }
}
