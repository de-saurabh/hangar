import { safeUrl, truncate } from './redact'
import type { SettingScope, SettingsLayer } from './settings'

/**
 * One configured hook handler. Claude Code's format is
 * hooks → event → matcher groups → handlers (type: command | http | prompt | agent | mcp_tool).
 */
export interface HookEntry {
  event: string
  matcher?: string
  type: string
  /** What the hook does, for display: the command, URL (without query), or prompt start. */
  summary: string
  timeout?: number
  /** Scopes that define this exact handler, highest precedence first. */
  sources: SettingScope[]
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function summarize(handler: Record<string, unknown>, type: string): string {
  const str = (k: string) => (typeof handler[k] === 'string' ? (handler[k] as string) : undefined)
  switch (type) {
    case 'command': {
      const args = Array.isArray(handler.args) ? handler.args.filter((a) => typeof a === 'string').join(' ') : ''
      return truncate([str('command'), args].filter(Boolean).join(' '), 300)
    }
    case 'http':
      return safeUrl(str('url') ?? '')
    case 'prompt':
    case 'agent':
      return truncate(str('prompt') ?? str('agent') ?? type, 120)
    default:
      return type // unknown handler types (e.g. mcp_tool, future ones): show the type, nothing else
  }
}

/**
 * Collect hooks from every settings layer. Hooks merge across scopes (they
 * don't override), and identical handlers in several files run once, so those
 * are collapsed with all their sources listed. Tolerates any malformed shape.
 */
export function hooksFromLayers(layers: SettingsLayer[], precedence: readonly SettingScope[]): HookEntry[] {
  const ordered = [...layers].sort((a, b) => precedence.indexOf(a.scope) - precedence.indexOf(b.scope))
  const out = new Map<string, HookEntry>()

  for (const layer of ordered) {
    const hooks = layer.data?.hooks
    if (!isObj(hooks)) continue
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) continue
      for (const group of groups) {
        if (!isObj(group) || !Array.isArray(group.hooks)) continue
        const matcher = typeof group.matcher === 'string' && group.matcher !== '' ? group.matcher : undefined
        for (const handler of group.hooks) {
          if (!isObj(handler)) continue
          const type = typeof handler.type === 'string' ? handler.type : 'unknown'
          const summary = summarize(handler, type)
          const key = [event, matcher ?? '', type, summary].join('\u0000')
          const existing = out.get(key)
          if (existing) {
            if (!existing.sources.includes(layer.scope)) existing.sources.push(layer.scope)
            continue
          }
          out.set(key, {
            event,
            ...(matcher ? { matcher } : {}),
            type,
            summary,
            ...(typeof handler.timeout === 'number' ? { timeout: handler.timeout } : {}),
            sources: [layer.scope],
          })
        }
      }
    }
  }
  return [...out.values()]
}
