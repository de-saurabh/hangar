import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LayerInfo, SettingsLayer } from '@hangar/shared'
import { readJsonFile } from './json.js'

/** Claude Code's config dir. Honours CLAUDE_CONFIG_DIR like Claude Code does. */
export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
}

export interface SettingsContext {
  claudeHome: string
  /** Absolute repo path; omit to read only user/managed settings. */
  repoPath?: string
}

// UNVERIFIED (see docs/DATA-SOURCES.md): none of these exist on the dev machine.
function managedSettingsPath(): string {
  if (process.platform === 'win32') return 'C:\\Program Files\\ClaudeCode\\managed-settings.json'
  if (process.platform === 'darwin') return '/Library/Application Support/ClaudeCode/managed-settings.json'
  return '/etc/claude-code/managed-settings.json'
}

/** Where each layer would live. Pure: no I/O. */
export function discover(ctx: SettingsContext): Pick<LayerInfo, 'scope' | 'path'>[] {
  const layers: Pick<LayerInfo, 'scope' | 'path'>[] = [
    { scope: 'managed', path: managedSettingsPath() },
    { scope: 'user', path: join(ctx.claudeHome, 'settings.json') },
  ]
  if (ctx.repoPath) {
    layers.push(
      { scope: 'project', path: join(ctx.repoPath, '.claude', 'settings.json') },
      { scope: 'local', path: join(ctx.repoPath, '.claude', 'settings.local.json') },
    )
  }
  return layers
}

/**
 * Read one file. Fails soft: a missing file is `exists: false`; unreadable or
 * invalid JSON sets a short `error` (never the file's content) and no data.
 * Tolerates comments and trailing commas (JSONC) and unknown keys.
 */
async function readLayer(target: Pick<LayerInfo, 'scope' | 'path'>): Promise<SettingsLayer> {
  const file = await readJsonFile(target.path)
  if (!file.exists) return { ...target, exists: false }
  if (file.error) return { ...target, exists: true, error: file.error }
  const data = file.data
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ...target, exists: true, error: 'Expected a JSON object' }
  }
  return { ...target, exists: true, data: data as Record<string, unknown> }
}

export async function read(ctx: SettingsContext): Promise<SettingsLayer[]> {
  return Promise.all(discover(ctx).map(readLayer))
}
