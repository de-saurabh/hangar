import { stat } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'
import type { McpHealth, SettingScope } from '@hangar/shared'
import { readJsonFile as readJson } from './sources/json.js'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const normalize = (p: string) => {
  const n = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? n.toLowerCase() : n
}

/**
 * The unsanitised config of one server, found by name and scope. Stays on the
 * server: URLs here can carry tokens and are never returned to the browser.
 */
export async function rawServer(claudeJsonPath: string, repoPath: string, scope: SettingScope, name: string): Promise<Obj | undefined> {
  let group: unknown
  if (scope === 'project') {
    const f = await readJson(join(repoPath, '.mcp.json'))
    group = isObj(f.data) ? f.data.mcpServers : undefined
  } else {
    const f = await readJson(claudeJsonPath)
    const root = isObj(f.data) ? f.data : undefined
    if (scope === 'user') group = root?.mcpServers
    else if (scope === 'local' && root && isObj(root.projects)) {
      const key = Object.keys(root.projects).find((k) => normalize(k) === normalize(repoPath))
      const entry = key !== undefined ? root.projects[key] : undefined
      group = isObj(entry) ? entry.mcpServers : undefined
    }
  }
  const s = isObj(group) ? group[name] : undefined
  return isObj(s) ? s : undefined
}

/** Is `command` runnable from PATH (or at the absolute path)? Never executes it. */
export async function commandExists(command: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const exts = process.platform === 'win32' ? ['', ...(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')] : ['']
  const candidates = isAbsolute(command) || /[\\/]/.test(command) ? [command] : (env.PATH ?? '').split(delimiter).filter(Boolean).map((d) => join(d, command))
  for (const base of candidates) {
    for (const ext of exts) {
      try {
        if ((await stat(base + ext)).isFile()) return true
      } catch {
        // keep looking
      }
    }
  }
  return false
}

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal; redirect: 'manual' }) => Promise<{ status: number; body?: { cancel(): Promise<void> } | null }>

const TIMEOUT_MS = 5000

/**
 * One health check. HTTP servers get a single header-only GET with no
 * credentials (reachable? needs auth?); stdio servers are checked for their
 * command on PATH. Nothing is spawned and no tool is called.
 */
export async function checkServer(raw: Obj, fetcher: Fetcher = fetch as unknown as Fetcher): Promise<McpHealth> {
  const checkedAt = new Date().toISOString()
  const command = typeof raw.command === 'string' ? raw.command : undefined
  const url = typeof raw.url === 'string' ? raw.url : undefined

  if (url && !command) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { ok: false, summary: 'The configured URL is not valid.', checkedAt }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, summary: `Unsupported URL scheme (${parsed.protocol.replace(':', '')}).`, checkedAt }
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const res = await fetcher(parsed.toString(), { method: 'GET', headers: { Accept: 'text/event-stream, application/json' }, signal: ctl.signal, redirect: 'manual' })
      await res.body?.cancel().catch(() => undefined)
      if (res.status === 401 || res.status === 403) return { ok: true, summary: `Reachable. It asks for credentials (HTTP ${res.status}), which Hangar doesn't send.`, checkedAt }
      if (res.status >= 500) return { ok: false, summary: `Reachable, but the server errors (HTTP ${res.status}).`, checkedAt }
      return { ok: true, summary: `Reachable (HTTP ${res.status}).`, checkedAt }
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError'
      const code = (e as { cause?: { code?: string } }).cause?.code
      return { ok: false, summary: aborted ? `No response within ${TIMEOUT_MS / 1000} s.` : `Can't connect${code ? ` (${code})` : ''}.`, checkedAt }
    } finally {
      clearTimeout(timer)
    }
  }

  if (command) {
    return (await commandExists(command))
      ? { ok: true, summary: `Command "${command}" found. Not started: stdio servers are only launched by Claude Code.`, checkedAt }
      : { ok: false, summary: `Command "${command}" was not found on PATH.`, checkedAt }
  }
  return { ok: false, summary: 'No command or URL configured.', checkedAt }
}
