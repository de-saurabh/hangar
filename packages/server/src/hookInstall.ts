import { join } from 'node:path'
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'
import { HOOK_EVENTS, type InstallPreview } from '@hangar/shared'
import { applyEdit, previewEdit, readText, StaleTokenError } from './settingsWrite.js'

/** Marks hook handlers Hangar owns; port-independent so a port change is just a reinstall. */
const OURS = /^http:\/\/127\.0\.0\.1:\d+\/api\/hook\?src=hangar$/

export const hookUrl = (port: number): string => `http://127.0.0.1:${port}/api/hook?src=hangar`

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

const isOurs = (h: unknown): boolean => isObj(h) && h.type === 'http' && typeof h.url === 'string' && OURS.test(h.url)

/** Matcher groups of one event without any Hangar handlers (groups left empty are dropped). */
function withoutOurs(groups: unknown): unknown[] {
  if (!Array.isArray(groups)) return []
  return groups.flatMap((g) => {
    if (!isObj(g) || !Array.isArray(g.hooks)) return [g]
    const kept = g.hooks.filter((h) => !isOurs(h))
    if (kept.length === g.hooks.length) return [g]
    return kept.length > 0 ? [{ ...g, hooks: kept }] : []
  })
}

export class SettingsParseError extends Error {}

function parseSettings(text: string): Json {
  if (text.trim() === '') return {}
  const errors: ParseError[] = []
  const v = parse(text, errors, { allowTrailingComma: true })
  if (errors.length > 0 || !isObj(v)) throw new SettingsParseError('settings.json is not valid JSON; fix it before installing hooks.')
  return v
}

const FORMAT = { insertSpaces: true, tabSize: 2, eol: '\n' }

function setPath(text: string, path: (string | number)[], value: unknown): string {
  return applyEdits(text, modify(text, path, value, { formattingOptions: FORMAT }))
}

export function isInstalled(text: string): boolean {
  const hooks = parseSettings(text).hooks
  return isObj(hooks) && Object.values(hooks).some((groups) => Array.isArray(groups) && groups.some((g) => isObj(g) && Array.isArray(g.hooks) && g.hooks.some(isOurs)))
}

/** Text of settings.json with Hangar's hooks added (idempotent) for every event in HOOK_EVENTS. */
export function computeInstall(text: string, url: string): string {
  const settings = parseSettings(text)
  let out = text.trim() === '' ? '{}\n' : text
  const hooks = isObj(settings.hooks) ? settings.hooks : {}
  for (const event of HOOK_EVENTS) {
    const groups = [...withoutOurs(hooks[event]), { hooks: [{ type: 'http', url, timeout: 5 }] }]
    out = setPath(out, ['hooks', event], groups)
  }
  return out
}

/** Text with every Hangar handler removed; events and `hooks` left empty are deleted. */
export function computeUninstall(text: string): string {
  const settings = parseSettings(text)
  let out = text
  const hooks = isObj(settings.hooks) ? settings.hooks : {}
  let remaining = Object.keys(hooks).length
  for (const [event, groups] of Object.entries(hooks)) {
    const cleaned = withoutOurs(groups)
    if (Array.isArray(groups) && cleaned.length === groups.length && JSON.stringify(cleaned) === JSON.stringify(groups)) continue
    if (cleaned.length === 0) {
      out = setPath(out, ['hooks', event], undefined)
      remaining--
    } else {
      out = setPath(out, ['hooks', event], cleaned)
    }
  }
  if (isObj(settings.hooks) && remaining === 0) out = setPath(out, ['hooks'], undefined)
  return out
}

const compute = (action: 'install' | 'uninstall', url: string) => (text: string) =>
  action === 'install' ? computeInstall(text, url) : computeUninstall(text)

export async function preview(claudeHome: string, port: number): Promise<InstallPreview> {
  const settingsPath = join(claudeHome, 'settings.json')
  const current = (await readText(settingsPath)) ?? ''
  const installed = isInstalled(current)
  const url = hookUrl(port)
  const action = installed ? 'uninstall' : 'install'
  const p = await previewEdit(settingsPath, compute(action, url))
  return { settingsPath, exists: p.exists, installed, url, events: HOOK_EVENTS, action, diff: p.diff, token: p.token }
}

export { StaleTokenError }

/** Apply install/uninstall through the shared safe-write path (token check, backup, atomic rename). */
export function apply(claudeHome: string, port: number, action: 'install' | 'uninstall', token: string): Promise<{ backupPath?: string }> {
  return applyEdit(join(claudeHome, 'settings.json'), compute(action, hookUrl(port)), token)
}
