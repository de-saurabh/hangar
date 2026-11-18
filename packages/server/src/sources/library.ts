import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { firstLine, hooksFromLayers, readFrontMatter, type LibraryItem, type LibraryKind, type Repo, type SettingScope } from '@hangar/shared'
import * as settings from './settings.js'

/** A discovered file-based item with the absolute paths the copy feature needs. */
export interface LibrarySource extends LibraryItem {
  /** Absolute path of the .md file, or of the skill folder. */
  abs: string
  /** Absolute `.claude` folder it lives in. */
  home: string
}

const MAX_BYTES = 1_000_000
const MAX_DEPTH = 4

const slash = (p: string) => p.split(sep).join('/')
const makeId = (kind: LibraryKind, abs: string) => createHash('sha1').update(`${kind}\0${abs}`).digest('hex').slice(0, 16)

async function listMarkdown(dir: string, depth = 0): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return [] // missing or unreadable folder is normal
  }
  const out: string[] = []
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isSymbolicLink()) continue
    const p = join(dir, e.name)
    if (e.isDirectory() && depth < MAX_DEPTH) out.push(...(await listMarkdown(p, depth + 1)))
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p)
  }
  return out
}

async function readHead(path: string): Promise<string> {
  try {
    if ((await stat(path)).size > MAX_BYTES) return ''
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

interface Place {
  home: string
  scope: 'user' | 'repo'
  repo?: Repo
}

async function fromPlace(place: Place): Promise<LibrarySource[]> {
  const out: LibrarySource[] = []
  const where = place.scope === 'user' ? { scope: 'user' as const } : { scope: 'repo' as const, repoId: place.repo!.id, repoName: place.repo!.name }

  for (const kind of ['commands', 'agents'] as const) {
    const root = join(place.home, kind)
    for (const abs of await listMarkdown(root)) {
      const text = await readHead(abs)
      const fm = readFrontMatter(text)
      const rel = slash(relative(root, abs)).replace(/\.md$/i, '')
      out.push({ id: makeId(kind, abs), kind, name: kind === 'agents' ? (fm.name || rel) : rel, description: fm.description || firstLine(text), ...where, path: `${kind}/${slash(relative(root, abs))}`, copyable: true, abs, home: place.home })
    }
  }

  // Skills: <home>/skills/<name>/SKILL.md. `synced` is managed by the Claude app, not authored by the user.
  const skillsRoot = join(place.home, 'skills')
  let dirs: import('node:fs').Dirent[] = []
  try {
    dirs = await readdir(skillsRoot, { withFileTypes: true })
  } catch {
    // none
  }
  for (const d of dirs.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isDirectory() || d.name === 'synced' || d.name.startsWith('.')) continue
    const abs = join(skillsRoot, d.name)
    const text = await readHead(join(abs, 'SKILL.md'))
    if (!text) continue
    const fm = readFrontMatter(text)
    out.push({ id: makeId('skills', abs), kind: 'skills', name: fm.name || d.name, description: fm.description || firstLine(text), ...where, path: `skills/${d.name}`, copyable: true, abs, home: place.home })
  }
  return out
}

/** Every command, agent and skill in `~/.claude` and each registered repo's `.claude`. */
export async function discoverFiles(claudeHome: string, repos: Repo[]): Promise<LibrarySource[]> {
  const places: Place[] = [{ home: claudeHome, scope: 'user' }, ...repos.map((r): Place => ({ home: join(r.path, '.claude'), scope: 'repo', repo: r }))]
  return (await Promise.all(places.map(fromPlace))).flat()
}

/** Hooks configured in user settings and each repo's settings (read-only listing). */
export async function discoverHooks(claudeHome: string, repos: Repo[]): Promise<LibraryItem[]> {
  const out: LibraryItem[] = []
  const add = (entries: ReturnType<typeof hooksFromLayers>, where: Pick<LibraryItem, 'scope' | 'repoId' | 'repoName'>, scopeFilter: SettingScope[]) => {
    for (const h of entries) {
      if (!h.sources.some((s) => scopeFilter.includes(s))) continue
      out.push({
        id: makeId('hooks', `${where.repoId ?? 'user'}\0${h.event}\0${h.matcher ?? ''}\0${h.type}\0${h.summary}`),
        kind: 'hooks',
        name: h.event + (h.matcher ? ` · ${h.matcher}` : ''),
        description: h.summary,
        ...where,
        path: 'settings.json',
        detail: h.type,
        copyable: false,
      })
    }
  }
  const user = await settings.read({ claudeHome })
  add(hooksFromLayers(user, ['user']), { scope: 'user' }, ['user'])
  for (const r of repos) {
    const layers = (await settings.read({ claudeHome, repoPath: r.path })).filter((l) => l.scope === 'project' || l.scope === 'local')
    add(hooksFromLayers(layers, ['local', 'project']), { scope: 'repo', repoId: r.id, repoName: r.name }, ['project', 'local'])
  }
  return out
}

/** Strip server-only fields before sending to the browser. */
export const publicItem = ({ abs: _abs, home: _home, ...item }: LibrarySource): LibraryItem => item
