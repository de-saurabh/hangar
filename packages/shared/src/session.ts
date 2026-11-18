import { redactText, safeUrl, truncate } from './redact'

/**
 * Pure, tolerant reducer over Claude Code transcript lines (one JSON object
 * per line). Feed each parsed line to `applyLine`; read results with
 * `summarize` / `state.events`. Unknown line types and fields are ignored.
 * Message text is redacted and truncated before it is stored.
 */

export type EventKind = 'prompt' | 'assistant' | 'tool' | 'edit' | 'error' | 'system'

export interface SessionEvent {
  id: string
  /** ISO timestamp. */
  t: string
  kind: EventKind
  /** Short caps label shown in the timeline: YOU, CLAUDE, READ, EDIT, BASH, COMPACTED... */
  label: string
  text: string
  failed?: boolean
  note?: string
}

export interface FileChange {
  path: string
  added: number
  removed: number
  created?: boolean
}

export interface TokenTotals {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export interface SessionSummary {
  id: string
  cwd?: string
  gitBranch?: string
  title: string
  titleSource: 'custom' | 'ai' | 'prompt' | 'none'
  /** Most recent real model used. */
  model?: string
  models: string[]
  startedAt?: string
  lastEventAt?: string
  prompts: number
  assistantMessages: number
  toolCalls: number
  tokens: TokenTotals
  /** Reported by Claude Code (`cost-state`). Undefined when the session has none. */
  costUSD?: number
  /** Approximate prompt size at the last assistant message. */
  contextTokens?: number
  /** Inferred (200k default, larger if a compaction proved otherwise). An estimate. */
  contextWindow?: number
  compactions: number
  linesAdded?: number
  linesRemoved?: number
  version?: string
  entrypoint?: string
}

export interface SessionState {
  id: string
  keepEvents: boolean
  events: SessionEvent[]
  /** True if events were dropped to stay within MAX_EVENTS. */
  eventsTruncated: boolean
  files: Map<string, FileChange>
  // internal accumulators
  cwd?: string
  gitBranch?: string
  version?: string
  entrypoint?: string
  customTitle?: string
  aiTitle?: string
  firstPrompt?: string
  startedAt?: string
  lastEventAt?: string
  prompts: number
  toolCalls: number
  compactions: number
  maxObservedTokens: number
  contextTokens?: number
  model?: string
  models: Set<string>
  /** Latest usage per assistant message id (one message spans several lines). */
  usageById: Map<string, Usage>
  cost?: { usd?: number; added?: number; removed?: number }
  toolEvent: Map<string, number>
  seq: number
}

interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export const MAX_EVENTS = 20_000
const TEXT_MAX = 400
const NOTE_MAX = 200

export function createSessionState(id: string, opts: { keepEvents?: boolean } = {}): SessionState {
  return {
    id,
    keepEvents: opts.keepEvents ?? false,
    events: [],
    eventsTruncated: false,
    files: new Map(),
    prompts: 0,
    toolCalls: 0,
    compactions: 0,
    maxObservedTokens: 0,
    models: new Set(),
    usageById: new Map(),
    toolEvent: new Map(),
    seq: 0,
  }
}

// ---- tolerant accessors ----------------------------------------------------

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function clean(text: string, max = TEXT_MAX): string {
  return truncate(redactText(text.replace(/\s+/g, ' ').trim()), max)
}

// ---- tool presentation -----------------------------------------------------

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function toolLabel(name: string): string {
  if (name.startsWith('mcp__')) return 'MCP'
  switch (name) {
    case 'Read': return 'READ'
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return 'EDIT'
    case 'Write': return 'WRITE'
    case 'Bash': return 'BASH'
    case 'PowerShell': return 'POWERSHELL'
    case 'Glob': case 'Grep': return 'SEARCH'
    case 'WebFetch': case 'WebSearch': return 'WEB'
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': case 'TaskStop': return 'TASKS'
    default: return name.toUpperCase()
  }
}

function toolText(name: string, input: unknown): string {
  const i = isObj(input) ? input : {}
  const pick = (...keys: string[]) => keys.map((k) => str(i[k])).find(Boolean)
  switch (name) {
    case 'Bash': case 'PowerShell': return clean(pick('command') ?? name)
    case 'Read': case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return clean(pick('file_path', 'notebook_path') ?? name)
    case 'Glob': case 'Grep': return clean([pick('pattern'), pick('path')].filter(Boolean).join('  in ') || name)
    case 'WebFetch': return safeUrl(pick('url') ?? '')
    case 'WebSearch': return clean(pick('query') ?? name)
    case 'Skill': return clean(pick('skill') ?? name)
    case 'AskUserQuestion': return 'Asked you a question'
    default:
      return name.startsWith('mcp__') ? name.replace(/^mcp__/, '').replace('__', ' · ') : name
  }
}

// ---- reducer ---------------------------------------------------------------

function pushEvent(s: SessionState, e: Omit<SessionEvent, 'id'> & { id?: string }): number {
  s.seq++
  if (!s.keepEvents) return -1
  if (s.events.length >= MAX_EVENTS) {
    s.eventsTruncated = true
    return -1
  }
  s.events.push({ ...e, id: e.id ?? `${s.id}:${s.seq}` })
  return s.events.length - 1
}

function touch(s: SessionState, ts: string | undefined): void {
  if (!ts) return
  if (!s.startedAt || ts < s.startedAt) s.startedAt = ts
  if (!s.lastEventAt || ts > s.lastEventAt) s.lastEventAt = ts
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((b) => (isObj(b) && b.type === 'text' ? (str(b.text) ?? '') : ''))
    .filter(Boolean)
    .join('\n')
}

function countPatch(patch: unknown): { added: number; removed: number } {
  let added = 0
  let removed = 0
  if (Array.isArray(patch)) {
    for (const hunk of patch) {
      const lines = isObj(hunk) && Array.isArray(hunk.lines) ? hunk.lines : []
      for (const l of lines) {
        if (typeof l !== 'string') continue
        if (l.startsWith('+')) added++
        else if (l.startsWith('-')) removed++
      }
    }
  }
  return { added, removed }
}

function recordFile(s: SessionState, path: string, added: number, removed: number, created?: boolean): void {
  const f = s.files.get(path) ?? { path, added: 0, removed: 0 }
  f.added += added
  f.removed += removed
  if (created) f.created = true
  s.files.set(path, f)
}

function applyToolResults(s: SessionState, raw: Obj, ts: string): void {
  const content = isObj(raw.message) ? raw.message.content : undefined
  if (Array.isArray(content)) {
    for (const b of content) {
      if (!isObj(b) || b.type !== 'tool_result') continue
      const idx = s.toolEvent.get(str(b.tool_use_id) ?? '')
      if (b.is_error === true) {
        const ev = idx !== undefined ? s.events[idx] : undefined
        const note = clean(textOf(b.content), NOTE_MAX)
        if (ev) {
          ev.failed = true
          if (note) ev.note = note
        } else if (s.keepEvents) {
          pushEvent(s, { t: ts, kind: 'error', label: 'ERROR', text: note || 'Tool call failed', failed: true })
        }
      }
    }
  }
  // File edits: per-call patch stats live on the result line.
  const r = raw.toolUseResult
  if (isObj(r)) {
    const path = str(r.filePath)
    if (path && Array.isArray(r.structuredPatch)) {
      const { added, removed } = countPatch(r.structuredPatch)
      recordFile(s, path, added, removed, r.type === 'create')
    } else if (path && r.type === 'create' && typeof r.content === 'string') {
      recordFile(s, path, r.content === '' ? 0 : r.content.split('\n').length, 0, true)
    }
  }
}

function applyUser(s: SessionState, raw: Obj, ts: string): void {
  if (raw.isCompactSummary === true) return // huge synthetic summary: never stored
  applyToolResults(s, raw, ts)
  if (raw.isMeta === true) return
  const content = isObj(raw.message) ? raw.message.content : undefined
  const isToolResultOnly = Array.isArray(content) && content.length > 0 && content.every((b) => isObj(b) && b.type === 'tool_result')
  if (isToolResultOnly) return
  const text = clean(textOf(content))
  if (!text) return
  s.prompts++
  if (s.firstPrompt === undefined) s.firstPrompt = truncate(text, 80)
  pushEvent(s, { id: str(raw.uuid), t: ts, kind: 'prompt', label: 'YOU', text })
}

function applyAssistant(s: SessionState, raw: Obj, ts: string): void {
  const msg = isObj(raw.message) ? raw.message : {}
  const model = str(msg.model)
  const real = model !== undefined && model !== '<synthetic>'
  if (real) {
    s.models.add(model)
    s.model = model
  }
  const u = isObj(msg.usage) ? msg.usage : undefined
  if (u && real) {
    const usage: Usage = {
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheRead: num(u.cache_read_input_tokens),
      cacheCreation: num(u.cache_creation_input_tokens),
    }
    s.usageById.set(str(msg.id) ?? str(raw.uuid) ?? `line${s.seq}`, usage)
    s.contextTokens = usage.input + usage.cacheRead + usage.cacheCreation
    s.maxObservedTokens = Math.max(s.maxObservedTokens, s.contextTokens)
  }
  const blocks = Array.isArray(msg.content) ? msg.content : []
  for (const b of blocks) {
    if (!isObj(b)) continue
    if (b.type === 'text') {
      const text = clean(str(b.text) ?? '')
      if (text) pushEvent(s, { t: ts, kind: 'assistant', label: 'CLAUDE', text })
    } else if (b.type === 'tool_use') {
      const name = str(b.name) ?? 'tool'
      s.toolCalls++
      const input = isObj(b.input) ? b.input : {}
      if (EDIT_TOOLS.has(name)) {
        const p = str(input.file_path) ?? str(input.notebook_path)
        if (p && !s.files.has(p)) s.files.set(p, { path: p, added: 0, removed: 0 })
      }
      const idx = pushEvent(s, {
        id: str(b.id),
        t: ts,
        kind: EDIT_TOOLS.has(name) ? 'edit' : 'tool',
        label: toolLabel(name),
        text: toolText(name, input),
      })
      const toolUseId = str(b.id)
      if (toolUseId && idx >= 0) s.toolEvent.set(toolUseId, idx)
    }
  }
}

function applySystem(s: SessionState, raw: Obj, ts: string): void {
  if (raw.subtype !== 'compact_boundary') return
  s.compactions++
  const m = isObj(raw.compactMetadata) ? raw.compactMetadata : {}
  const pre = num(m.preTokens)
  const post = num(m.postTokens)
  s.maxObservedTokens = Math.max(s.maxObservedTokens, pre)
  const fmt = (n: number) => `${Math.round(n / 1000)}k`
  pushEvent(s, {
    id: str(raw.uuid),
    t: ts,
    kind: 'system',
    label: 'COMPACTED',
    text: pre && post ? `Context compacted ${fmt(pre)} → ${fmt(post)} tokens` : 'Context compacted',
    ...(str(m.trigger) ? { note: `Trigger: ${str(m.trigger)}` } : {}),
  })
}

/** Feed one parsed transcript line. Never throws on odd input. */
export function applyLine(s: SessionState, raw: unknown): void {
  if (!isObj(raw)) return
  const type = str(raw.type)
  if (!type) return

  switch (type) {
    case 'custom-title':
      s.customTitle = str(raw.customTitle) ?? s.customTitle
      return
    case 'ai-title':
      s.aiTitle = str(raw.aiTitle) ?? s.aiTitle
      return
    case 'cost-state':
      s.cost = { usd: num(raw.totalCostUSD), added: num(raw.totalLinesAdded), removed: num(raw.totalLinesRemoved) }
      return
  }

  if (type !== 'user' && type !== 'assistant' && type !== 'system') return
  const ts = str(raw.timestamp)
  touch(s, ts)
  s.cwd = str(raw.cwd) ?? s.cwd
  s.gitBranch = str(raw.gitBranch) ?? s.gitBranch
  s.version = str(raw.version) ?? s.version
  s.entrypoint = str(raw.entrypoint) ?? s.entrypoint
  const when = ts ?? s.lastEventAt ?? ''

  if (type === 'user') applyUser(s, raw, when)
  else if (type === 'assistant') applyAssistant(s, raw, when)
  else applySystem(s, raw, when)
}

export function summarize(s: SessionState): SessionSummary {
  const tokens: TokenTotals = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
  for (const u of s.usageById.values()) {
    tokens.input += u.input
    tokens.output += u.output
    tokens.cacheRead += u.cacheRead
    tokens.cacheCreation += u.cacheCreation
  }
  const title = s.customTitle ?? s.aiTitle ?? s.firstPrompt ?? 'Untitled session'
  const titleSource = s.customTitle ? 'custom' : s.aiTitle ? 'ai' : s.firstPrompt ? 'prompt' : 'none'
  let fileAdded = 0
  let fileRemoved = 0
  for (const f of s.files.values()) {
    fileAdded += f.added
    fileRemoved += f.removed
  }
  return {
    id: s.id,
    ...(s.cwd ? { cwd: s.cwd } : {}),
    ...(s.gitBranch ? { gitBranch: s.gitBranch } : {}),
    title,
    titleSource,
    ...(s.model ? { model: s.model } : {}),
    models: [...s.models],
    ...(s.startedAt ? { startedAt: s.startedAt } : {}),
    ...(s.lastEventAt ? { lastEventAt: s.lastEventAt } : {}),
    prompts: s.prompts,
    assistantMessages: s.usageById.size,
    toolCalls: s.toolCalls,
    tokens,
    ...(s.cost?.usd !== undefined ? { costUSD: s.cost.usd } : {}),
    ...(s.contextTokens !== undefined
      ? { contextTokens: s.contextTokens, contextWindow: s.maxObservedTokens > 200_000 ? 1_000_000 : 200_000 }
      : {}),
    compactions: s.compactions,
    linesAdded: s.cost?.added ?? fileAdded,
    linesRemoved: s.cost?.removed ?? fileRemoved,
    ...(s.version ? { version: s.version } : {}),
    ...(s.entrypoint ? { entrypoint: s.entrypoint } : {}),
  }
}
