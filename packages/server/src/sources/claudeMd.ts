import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, relative, sep } from 'node:path'
import { estimateTokens, type LintFile, type MemoryFile, type MemoryKind } from '@hangar/shared'

export interface MemoryContext {
  claudeHome: string
  repoPath: string
}

interface Target {
  kind: MemoryKind
  path: string
  label: string
  scopeDir?: string
}

const MAX_BYTES = 1_000_000
const MAX_DEPTH = 6
const MAX_DIRS = 2000
// Never descend into these when looking for nested CLAUDE.md files.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'target', 'vendor', '__pycache__', 'venv'])

const slash = (p: string) => p.split(sep).join('/')

/** `~/...` for paths under the home dir, otherwise the path as is. */
function tildePath(p: string): string {
  const home = homedir()
  return p.startsWith(home) ? `~${slash(p.slice(home.length))}` : slash(p)
}

/** Nested CLAUDE.md files below the repo root. Bounded, skips dot-dirs, vendored dirs and symlinks. */
async function findNested(root: string): Promise<string[]> {
  const found: string[] = []
  let visited = 0
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || visited >= MAX_DIRS) return
    visited++
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable dir: skip, never fail
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
        await walk(join(dir, e.name), depth + 1)
      } else if (e.isFile() && depth > 0 && e.name === 'CLAUDE.md') {
        found.push(join(dir, e.name))
      }
    }
  }
  await walk(root, 0)
  return found
}

/** Every CLAUDE.md that applies to the repo, in load order: user, project, local, nested. */
export async function discover(ctx: MemoryContext): Promise<Target[]> {
  const repoName = basename(ctx.repoPath)
  const inRepo = (p: string) => `${repoName}/${slash(relative(ctx.repoPath, p))}`
  const userPath = join(ctx.claudeHome, 'CLAUDE.md')
  const projectPath = join(ctx.repoPath, 'CLAUDE.md')
  const localPath = join(ctx.repoPath, 'CLAUDE.local.md')

  const targets: Target[] = [
    { kind: 'user', path: userPath, label: tildePath(userPath) },
    { kind: 'project', path: projectPath, label: inRepo(projectPath) },
    { kind: 'local', path: localPath, label: inRepo(localPath) },
  ]
  for (const p of await findNested(ctx.repoPath)) {
    targets.push({
      kind: 'nested',
      path: p,
      label: inRepo(p),
      scopeDir: slash(relative(ctx.repoPath, join(p, '..'))),
    })
  }
  return targets
}

/** Reads one file for size/token stats only. Content is never returned or logged. */
async function readOne(t: Target): Promise<MemoryFile> {
  const base = { kind: t.kind, path: t.path, label: t.label, ...(t.scopeDir ? { scopeDir: t.scopeDir } : {}) }
  try {
    const info = await stat(t.path)
    if (!info.isFile()) return { ...base, exists: false }
    const common = { ...base, exists: true, bytes: info.size, modifiedAt: info.mtime.toISOString() }
    if (info.size > MAX_BYTES) return { ...common, error: 'File too large to analyse' }
    const text = await readFile(t.path, 'utf8')
    return { ...common, lines: text === '' ? 0 : text.split(/\r?\n/).length, tokens: estimateTokens(text) }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { ...base, exists: false }
    return { ...base, exists: true, error: `Couldn't read file (${code ?? 'unknown error'})` }
  }
}

/** Text of every existing CLAUDE.md for linting, with the dir its relative paths resolve against. Never logged. */
export async function readForLint(ctx: MemoryContext): Promise<LintFile[]> {
  const out: LintFile[] = []
  for (const t of await discover(ctx)) {
    try {
      const info = await stat(t.path)
      if (!info.isFile() || info.size > MAX_BYTES) continue
      out.push({ kind: t.kind, label: t.label, baseDir: ctx.repoPath, text: await readFile(t.path, 'utf8') })
    } catch {
      // missing or unreadable: nothing to lint
    }
  }
  return out
}

export async function read(ctx: MemoryContext): Promise<MemoryFile[]> {
  return Promise.all((await discover(ctx)).map(readOne))
}
