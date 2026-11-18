import { safeUrl } from './redact'
import { SCOPE_PRECEDENCE, type SettingScope } from './settings'

/**
 * One configured MCP server. Deliberately lossy: command arguments, env
 * values and headers can all hold tokens, so only names/counts are kept.
 */
export interface McpServer {
  name: string
  /** user = ~/.claude.json, local = ~/.claude.json projects[repo], project = <repo>/.mcp.json */
  scope: SettingScope
  transport: string
  /** Executable only (stdio). Arguments are omitted on purpose. */
  command?: string
  argCount?: number
  /** URL without credentials/query (http, sse). */
  url?: string
  /** Names of env vars set for the server; values are never exposed. */
  envKeys: string[]
  /** `.mcp.json` servers need approval: approved / rejected / unknown. */
  approval?: 'approved' | 'rejected' | 'unknown'
  /** A server with the same name in a higher-precedence scope wins. */
  overriddenBy?: SettingScope
}

export interface McpSourceInfo {
  scope: SettingScope
  path: string
  exists: boolean
  error?: string
}

export interface McpResult {
  sources: McpSourceInfo[]
  servers: McpServer[]
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export interface McpInput {
  /** `mcpServers` object from each place, if present. */
  user?: unknown
  local?: unknown
  project?: unknown
  /** `enabledMcpjsonServers` / `disabledMcpjsonServers` from ~/.claude.json projects[repo]. */
  enabled?: unknown
  disabled?: unknown
}

function toServer(name: string, raw: unknown, scope: SettingScope): McpServer {
  const o = isObj(raw) ? raw : {}
  const command = typeof o.command === 'string' ? o.command : undefined
  const url = typeof o.url === 'string' ? safeUrl(o.url) : undefined
  const transport = typeof o.type === 'string' ? o.type : command ? 'stdio' : url ? 'http' : 'unknown'
  return {
    name,
    scope,
    transport,
    ...(command ? { command } : {}),
    ...(Array.isArray(o.args) ? { argCount: o.args.length } : {}),
    ...(url ? { url } : {}),
    envKeys: isObj(o.env) ? Object.keys(o.env).sort() : [],
  }
}

const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Pure: turn raw `mcpServers` objects into display-safe servers, marking shadowed names. */
export function buildMcpServers(input: McpInput): McpServer[] {
  const enabled = new Set(names(input.enabled))
  const disabled = new Set(names(input.disabled))
  const servers: McpServer[] = []

  for (const scope of ['local', 'project', 'user'] as const) {
    const group = input[scope]
    if (!isObj(group)) continue
    for (const [name, raw] of Object.entries(group)) {
      const s = toServer(name, raw, scope)
      if (scope === 'project') s.approval = enabled.has(name) ? 'approved' : disabled.has(name) ? 'rejected' : 'unknown'
      servers.push(s)
    }
  }

  // Same name in several scopes: highest precedence wins (local > project > user).
  const winner = new Map<string, SettingScope>()
  for (const s of servers) {
    const cur = winner.get(s.name)
    if (!cur || SCOPE_PRECEDENCE.indexOf(s.scope) < SCOPE_PRECEDENCE.indexOf(cur)) winner.set(s.name, s.scope)
  }
  for (const s of servers) {
    const w = winner.get(s.name)
    if (w && w !== s.scope) s.overriddenBy = w
  }
  return servers
}

/** Result of a user-triggered health check. Never includes URLs, headers or output from the server. */
export interface McpHealth {
  ok: boolean
  summary: string
  checkedAt: string
}
