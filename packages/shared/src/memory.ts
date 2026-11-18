/** CLAUDE.md ("memory") files that Claude Code loads for a repo. */

export type MemoryKind = 'user' | 'project' | 'local' | 'nested'

export interface MemoryFile {
  kind: MemoryKind
  /** Absolute path. */
  path: string
  /** Short display path, e.g. `api-server/CLAUDE.md` or `~/.claude/CLAUDE.md`. */
  label: string
  exists: boolean
  /** Short reason, never file content. */
  error?: string
  bytes?: number
  lines?: number
  /** Estimated, not exact: there is no offline Claude tokenizer. Show as "~N". */
  tokens?: number
  modifiedAt?: string
  /** Nested files only: the repo-relative folder this file applies to. */
  scopeDir?: string
}

const CHARS_PER_TOKEN = 4

/** Rough token estimate (chars / 4). Good enough for size warnings. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** Above this a CLAUDE.md is loud enough to deserve a warning in the UI. */
export const LARGE_MEMORY_TOKENS = 4000
