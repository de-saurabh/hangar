import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildMcpServers, type McpResult, type McpSourceInfo } from '@hangar/shared'
import { readJsonFile } from './json.js'

export interface McpContext {
  /** Path to ~/.claude.json (user + per-project servers). */
  claudeJsonPath: string
  repoPath: string
}

/**
 * ~/.claude.json lives in the home dir. With CLAUDE_CONFIG_DIR set it is
 * expected inside that dir instead (UNVERIFIED, see docs/DATA-SOURCES.md).
 */
export function defaultClaudeJsonPath(): string {
  const dir = process.env.CLAUDE_CONFIG_DIR
  return dir ? join(dir, '.claude.json') : join(homedir(), '.claude.json')
}

/** ~/.claude.json keys projects with forward slashes on Windows; compare loosely. */
function normalizePath(p: string): string {
  const n = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? n.toLowerCase() : n
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Read MCP servers for a repo. ~/.claude.json also holds account data and
 * tokens, so only `mcpServers` and the repo's own entry are ever picked out;
 * nothing else from it is returned or logged.
 */
export async function read(ctx: McpContext): Promise<McpResult> {
  const mcpJsonPath = join(ctx.repoPath, '.mcp.json')
  const [claudeJson, mcpJson] = await Promise.all([readJsonFile(ctx.claudeJsonPath), readJsonFile(mcpJsonPath)])

  const root = isObj(claudeJson.data) ? claudeJson.data : undefined
  const projects = root && isObj(root.projects) ? root.projects : undefined
  const wanted = normalizePath(ctx.repoPath)
  const projectKey = projects ? Object.keys(projects).find((k) => normalizePath(k) === wanted) : undefined
  const projectEntry = projects && projectKey !== undefined && isObj(projects[projectKey]) ? (projects[projectKey] as Record<string, unknown>) : undefined
  const projectMcp = isObj(mcpJson.data) ? mcpJson.data : undefined

  const claudeError = claudeJson.error ?? (claudeJson.exists && !root ? 'Expected a JSON object' : undefined)
  const projectError = mcpJson.error ?? (mcpJson.exists && !projectMcp ? 'Expected a JSON object' : undefined)
  const sources: McpSourceInfo[] = [
    { scope: 'user', path: ctx.claudeJsonPath, exists: claudeJson.exists, ...(claudeError ? { error: claudeError } : {}) },
    { scope: 'local', path: ctx.claudeJsonPath, exists: claudeJson.exists, ...(claudeError ? { error: claudeError } : {}) },
    { scope: 'project', path: mcpJsonPath, exists: mcpJson.exists, ...(projectError ? { error: projectError } : {}) },
  ]

  const servers = buildMcpServers({
    user: root?.mcpServers,
    local: projectEntry?.mcpServers,
    project: projectMcp?.mcpServers,
    enabled: projectEntry?.enabledMcpjsonServers,
    disabled: projectEntry?.disabledMcpjsonServers,
  })
  return { sources, servers }
}
