import { redactText, truncate } from './redact'

/**
 * Live status of a session, from Claude Code hook events (authoritative) with
 * the `~/.claude/sessions/<pid>.json` registry as fallback. Pure functions:
 * the server owns the clock and the storage.
 */
export type LiveStatus = 'waiting' | 'running' | 'idle' | 'finished'

export interface LiveState {
  sessionId: string
  status: LiveStatus
  /** ms epoch of the last status change. */
  since: number
  /** ms epoch of the last event of any kind. */
  lastEventAt: number
  /** What it is doing / waiting on. Redacted, short. */
  detail?: string
  cwd?: string
}

/** The subset of a hook payload Hangar reads. Everything else (tool output, prompts) is ignored. */
export interface HookPayload {
  session_id?: unknown
  hook_event_name?: unknown
  cwd?: unknown
  tool_name?: unknown
  tool_input?: unknown
  notification_type?: unknown
  message?: unknown
}

/** Hook events Hangar subscribes to when installing. */
export const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'Notification',
  'PreCompact',
  'Stop',
  'SessionEnd',
] as const

const WAITING_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog', 'agent_needs_input'])

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Short, redacted description of a tool call, e.g. "Bash: npm test". Never includes outputs. */
export function describeTool(name: unknown, input: unknown): string | undefined {
  const tool = str(name)
  if (!tool) return undefined
  const i = isObj(input) ? input : {}
  const arg = str(i.command) ?? str(i.file_path) ?? str(i.notebook_path) ?? str(i.pattern) ?? str(i.url) ?? str(i.query) ?? str(i.skill)
  return truncate(redactText(arg ? `${tool}: ${arg.replace(/\s+/g, ' ').trim()}` : tool), 140)
}

/** Fold one hook event into a session's live state. Unknown events only refresh `lastEventAt`. */
export function applyHook(prev: LiveState | undefined, payload: HookPayload, now: number): LiveState | undefined {
  const sessionId = str(payload.session_id)
  const event = str(payload.hook_event_name)
  if (!sessionId || !event) return prev

  let status: LiveStatus | undefined
  let detail: string | undefined
  switch (event) {
    case 'SessionStart':
      status = 'idle'
      break
    case 'UserPromptSubmit':
    case 'PostToolUse':
    case 'PostCompact':
      status = 'running'
      break
    case 'PreToolUse':
      status = 'running'
      detail = describeTool(payload.tool_name, payload.tool_input)
      break
    case 'PreCompact':
      status = 'running'
      detail = 'Compacting context'
      break
    case 'PermissionRequest':
      status = 'waiting'
      detail = describeTool(payload.tool_name, payload.tool_input) ?? 'Permission needed'
      break
    case 'Notification': {
      const type = str(payload.notification_type)
      if (type && WAITING_NOTIFICATIONS.has(type)) {
        status = 'waiting'
        const msg = str(payload.message)
        detail = msg ? truncate(redactText(msg), 140) : type === 'permission_prompt' ? 'Permission needed' : 'Needs your input'
      } else if (type === 'idle_prompt') {
        status = 'idle'
      }
      break
    }
    case 'Stop':
      status = 'idle'
      break
    case 'SessionEnd':
      status = 'finished'
      break
  }

  const cwd = str(payload.cwd) ?? prev?.cwd
  if (!status) {
    return prev ? { ...prev, lastEventAt: now, ...(cwd ? { cwd } : {}) } : prev
  }
  const changed = prev?.status !== status
  return {
    sessionId,
    status,
    since: changed || !prev ? now : prev.since,
    lastEventAt: now,
    ...(detail ? { detail } : {}),
    ...(cwd ? { cwd } : {}),
  }
}

export interface RegistryEntry {
  sessionId: string
  pid: number
  /** `busy` / `idle` as written by Claude Code; anything else is treated as unknown. */
  status?: string
  cwd?: string
  name?: string
  alive: boolean
}

/**
 * Combine hook state with the registry. Hooks win while fresh; the registry
 * covers sessions that started before Hangar's hooks were installed.
 * A dead process is always `finished`.
 */
export function resolveStatus(hook: LiveState | undefined, reg: RegistryEntry | undefined, now: number, staleMs = 10 * 60_000): LiveState | undefined {
  if (reg && !reg.alive) {
    if (hook?.status === 'finished') return hook
    return { sessionId: reg.sessionId, status: 'finished', since: hook?.lastEventAt ?? now, lastEventAt: hook?.lastEventAt ?? now, ...(reg.cwd ? { cwd: reg.cwd } : {}) }
  }
  const hookFresh = hook && (now - hook.lastEventAt < staleMs || reg === undefined)
  if (hook && hookFresh) return hook
  if (reg) {
    const status: LiveStatus | undefined = reg.status === 'busy' ? 'running' : reg.status === 'idle' ? 'idle' : undefined
    if (status) return { sessionId: reg.sessionId, status, since: hook?.since ?? now, lastEventAt: hook?.lastEventAt ?? now, ...(reg.cwd ? { cwd: reg.cwd } : {}) }
  }
  return hook
}
