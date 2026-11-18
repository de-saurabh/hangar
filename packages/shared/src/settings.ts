import { hooksFromLayers, type HookEntry } from './hooks'

/**
 * Settings model + pure "effective config" merge. No I/O here: the server
 * adapter reads the files, this turns layers into what Claude Code would use.
 */

/** Highest precedence first. (`--settings` CLI overrides aren't knowable from disk.) */
export const SCOPE_PRECEDENCE = ['managed', 'local', 'project', 'user'] as const
export type SettingScope = (typeof SCOPE_PRECEDENCE)[number]

/** Info about one settings file. `error` is a short reason, never file content. */
export interface LayerInfo {
  scope: SettingScope
  path: string
  exists: boolean
  error?: string
}

export interface SettingsLayer extends LayerInfo {
  data?: Record<string, unknown>
}

export interface SettingValue {
  key: string
  value: unknown
  source: SettingScope
  /** Lower-precedence layers that also set this key (and lost). */
  overrides: { source: SettingScope; value: unknown }[]
}

export type PermissionKind = 'allow' | 'deny' | 'ask'
export interface RuleEntry {
  rule: string
  /** Every scope that lists this rule, highest precedence first. */
  sources: SettingScope[]
}

export interface EffectiveSettings {
  layers: LayerInfo[]
  values: SettingValue[]
  permissions: Record<PermissionKind, RuleEntry[]>
  hooks: HookEntry[]
}

const PERMISSION_KINDS: PermissionKind[] = ['allow', 'deny', 'ask']

// Keys with their own adapters/merge rules; excluded from the generic key list.
const SKIP_KEYS = new Set(['permissions.allow', 'permissions.deny', 'permissions.ask', 'hooks'])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Flatten nested objects to dotted keys. Arrays and primitives are leaves. */
export function flatten(obj: Record<string, unknown>, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (SKIP_KEYS.has(key)) continue
    if (isPlainObject(v) && Object.keys(v).length > 0) {
      for (const [ck, cv] of flatten(v, key)) out.set(ck, cv)
    } else {
      out.set(key, v)
    }
  }
  return out
}

const rank = (s: SettingScope) => SCOPE_PRECEDENCE.indexOf(s)

export interface ScopeValue {
  key: string
  value: unknown
  /** Set when a higher-precedence layer wins this key, so this layer's value is inactive. */
  overriddenBy?: SettingScope
}

/** What one layer sets, for the per-scope tabs. `values` must come from `effectiveSettings`. */
export function valuesForScope(values: SettingValue[], scope: SettingScope): ScopeValue[] {
  const out: ScopeValue[] = []
  for (const v of values) {
    if (v.source === scope) {
      out.push({ key: v.key, value: v.value })
    } else {
      const lost = v.overrides.find((o) => o.source === scope)
      if (lost) out.push({ key: v.key, value: lost.value, overriddenBy: v.source })
    }
  }
  return out
}

export function effectiveSettings(layers: SettingsLayer[]): EffectiveSettings {
  const ordered = [...layers].sort((a, b) => rank(a.scope) - rank(b.scope))

  // Scalars/objects: highest-precedence layer wins; record who it overrode.
  const byKey = new Map<string, { source: SettingScope; value: unknown }[]>()
  for (const layer of ordered) {
    if (!layer.data) continue
    for (const [key, value] of flatten(layer.data)) {
      const list = byKey.get(key) ?? []
      list.push({ source: layer.scope, value })
      byKey.set(key, list)
    }
  }
  const values: SettingValue[] = [...byKey.entries()]
    .map(([key, list]) => {
      const [winner, ...rest] = list as [{ source: SettingScope; value: unknown }, ...{ source: SettingScope; value: unknown }[]]
      return { key, value: winner.value, source: winner.source, overrides: rest }
    })
    .sort((a, b) => a.key.localeCompare(b.key))

  // Permission rule lists are merged across scopes, not overridden.
  const permissions = { allow: [], deny: [], ask: [] } as Record<PermissionKind, RuleEntry[]>
  for (const kind of PERMISSION_KINDS) {
    const seen = new Map<string, RuleEntry>()
    for (const layer of ordered) {
      const perms = layer.data?.permissions
      const rules = isPlainObject(perms) ? perms[kind] : undefined
      if (!Array.isArray(rules)) continue
      for (const rule of rules) {
        if (typeof rule !== 'string') continue
        const entry = seen.get(rule)
        if (entry) entry.sources.push(layer.scope)
        else seen.set(rule, { rule, sources: [layer.scope] })
      }
    }
    permissions[kind] = [...seen.values()]
  }

  return {
    layers: layers.map(({ scope, path, exists, error }) => ({ scope, path, exists, ...(error ? { error } : {}) })),
    values,
    permissions,
    hooks: hooksFromLayers(layers, SCOPE_PRECEDENCE),
  }
}
