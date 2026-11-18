import { join } from 'node:path'
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'
import { isValidRule, type Repo } from '@hangar/shared'
import { applyEdit, previewEdit, readText, type EditPreview } from './settingsWrite.js'

export class AllowlistError extends Error {}

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function parseSettings(text: string): Json {
  if (text.trim() === '') return {}
  const errors: ParseError[] = []
  const v = parse(text, errors, { allowTrailingComma: true })
  if (errors.length > 0 || !isObj(v)) throw new AllowlistError('The settings file is not valid JSON; fix it before adding a rule.')
  return v
}

export function allowRules(text: string): string[] {
  const perms = parseSettings(text).permissions
  const allow = isObj(perms) ? perms.allow : undefined
  return Array.isArray(allow) ? allow.filter((r): r is string => typeof r === 'string') : []
}

/** Text with `rule` appended to permissions.allow (idempotent; every other key and comment untouched). */
export function computeAddRule(text: string, rule: string): string {
  if (!isValidRule(rule)) throw new AllowlistError('Not a valid permission rule.')
  const current = allowRules(text)
  if (current.includes(rule)) return text
  const base = text.trim() === '' ? '{}\n' : text
  return applyEdits(base, modify(base, ['permissions', 'allow', current.length], rule, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' }, isArrayInsertion: true }))
}

export type AllowTarget = { scope: 'global' } | { scope: 'repo'; repo: Repo }

/** Global rules go to ~/.claude/settings.json; repo rules to the repo's untracked .claude/settings.local.json. */
export const targetPath = (claudeHome: string, t: AllowTarget): string => (t.scope === 'global' ? join(claudeHome, 'settings.json') : join(t.repo.path, '.claude', 'settings.local.json'))

export const previewAdd = (path: string, rule: string): Promise<EditPreview> => previewEdit(path, (text) => computeAddRule(text, rule))
export const applyAdd = (path: string, rule: string, token: string) => applyEdit(path, (text) => computeAddRule(text, rule), token)

/** True if the rule is already allowed by user settings, or by the repo's project/local settings. */
export async function isAllowed(claudeHome: string, rule: string, repo?: Repo): Promise<boolean> {
  const files = [join(claudeHome, 'settings.json'), ...(repo ? [join(repo.path, '.claude', 'settings.json'), join(repo.path, '.claude', 'settings.local.json')] : [])]
  for (const f of files) {
    try {
      const text = await readText(f)
      if (text !== undefined && allowRules(text).includes(rule)) return true
    } catch {
      // unreadable or invalid: treat as not allowed
    }
  }
  return false
}
