/** Reusable Claude Code building blocks found on disk: commands, agents, skills, hooks. */

export type LibraryKind = 'commands' | 'agents' | 'skills' | 'hooks'
export const LIBRARY_KINDS: readonly LibraryKind[] = ['commands', 'agents', 'skills', 'hooks']

export interface LibraryItem {
  /** Stable id (hash of kind + absolute path), safe to send back to the server. */
  id: string
  kind: LibraryKind
  /** `deploy`, `team/review` (namespaced command), skill folder name, or hook event. */
  name: string
  description: string
  scope: 'user' | 'repo'
  repoId?: string
  repoName?: string
  /** Display path relative to its `.claude` folder, e.g. `commands/deploy.md`. */
  path: string
  /** Hooks only: handler type and matcher. Hooks are listed, not copyable yet. */
  detail?: string
  /** Files and folders can be copied; hooks cannot. */
  copyable: boolean
}

export interface LibraryResponse {
  items: LibraryItem[]
}

/**
 * Minimal front-matter reader: `---` block of `key: value` lines at the top.
 * Tolerates quotes, folded scalars (`>` / `|`) and anything it doesn't understand.
 */
export function readFrontMatter(text: string): Record<string, string> {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!m) return {}
  const out: Record<string, string> = {}
  const lines = m[1]!.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i]!)
    if (!kv) continue
    let value = kv[2]!.trim()
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const parts: string[] = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) parts.push(lines[++i]!.trim())
      value = parts.join(' ')
    } else if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1)
    }
    out[kv[1]!] = value
  }
  return out
}

/** First non-empty, non-heading line, for items without a `description`. */
export function firstLine(text: string): string {
  const body = text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
  for (const l of body.split(/\r?\n/)) {
    const t = l.trim().replace(/^#+\s*/, '')
    if (t) return t.slice(0, 200)
  }
  return ''
}
