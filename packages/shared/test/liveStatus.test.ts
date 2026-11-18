import { describe, expect, it } from 'vitest'
import { applyHook, describeTool, resolveStatus, type LiveState } from '../src/index'

const ev = (hook_event_name: string, extra: object = {}) => ({ session_id: 's1', hook_event_name, ...extra })

describe('applyHook', () => {
  it('walks a normal turn: start -> prompt -> tool -> stop', () => {
    let s = applyHook(undefined, ev('SessionStart'), 100)
    expect(s).toMatchObject({ status: 'idle', since: 100 })
    s = applyHook(s, ev('UserPromptSubmit'), 200)
    expect(s).toMatchObject({ status: 'running', since: 200 })
    s = applyHook(s, ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm   test' } }), 300)
    expect(s).toMatchObject({ status: 'running', since: 200, detail: 'Bash: npm test', lastEventAt: 300 })
    s = applyHook(s, ev('Stop'), 400)
    expect(s).toMatchObject({ status: 'idle', since: 400 })
    s = applyHook(s, ev('SessionEnd'), 500)
    expect(s?.status).toBe('finished')
  })

  it('goes waiting on a permission request and back to running once the tool runs', () => {
    let s = applyHook(undefined, ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm run db:migrate' } }), 10)
    expect(s).toMatchObject({ status: 'waiting', detail: 'Bash: npm run db:migrate' })
    s = applyHook(s, ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm run db:migrate' } }), 20)
    expect(s?.status).toBe('running')
  })

  it('maps notification types', () => {
    expect(applyHook(undefined, ev('Notification', { notification_type: 'permission_prompt' }), 1)).toMatchObject({ status: 'waiting', detail: 'Permission needed' })
    expect(applyHook(undefined, ev('Notification', { notification_type: 'elicitation_dialog', message: 'Keep the old route?' }), 1)).toMatchObject({ status: 'waiting', detail: 'Keep the old route?' })
    expect(applyHook(undefined, ev('Notification', { notification_type: 'idle_prompt' }), 1)?.status).toBe('idle')
  })

  it('leaves status alone for unrelated notifications but refreshes lastEventAt', () => {
    const prev: LiveState = { sessionId: 's1', status: 'running', since: 5, lastEventAt: 5 }
    expect(applyHook(prev, ev('Notification', { notification_type: 'auth_success' }), 50)).toEqual({ ...prev, lastEventAt: 50 })
    expect(applyHook(undefined, ev('SomethingNew'), 1)).toBeUndefined()
  })

  it('ignores payloads without a session id or event name, and never throws', () => {
    expect(applyHook(undefined, {}, 1)).toBeUndefined()
    expect(applyHook(undefined, { session_id: 5, hook_event_name: {} } as never, 1)).toBeUndefined()
  })

  it('redacts secrets and truncates details', () => {
    const d = describeTool('Bash', { command: 'API_TOKEN=abcdef123456 ' + 'x'.repeat(500) })
    expect(d).not.toContain('abcdef123456')
    expect((d ?? '').length).toBeLessThanOrEqual(140)
  })
})

describe('resolveStatus', () => {
  const hook: LiveState = { sessionId: 's1', status: 'waiting', since: 1000, lastEventAt: 1000 }
  const reg = (over: object = {}) => ({ sessionId: 's1', pid: 1, status: 'busy', alive: true, ...over })

  it('prefers a fresh hook state over the registry', () => {
    expect(resolveStatus(hook, reg(), 2000)?.status).toBe('waiting')
  })

  it('falls back to the registry when there is no hook state', () => {
    expect(resolveStatus(undefined, reg(), 5)?.status).toBe('running')
    expect(resolveStatus(undefined, reg({ status: 'idle' }), 5)?.status).toBe('idle')
    expect(resolveStatus(undefined, reg({ status: 'weird' }), 5)).toBeUndefined()
  })

  it('uses the registry when the hook state is stale', () => {
    expect(resolveStatus(hook, reg({ status: 'idle' }), 1000 + 11 * 60_000)?.status).toBe('idle')
  })

  it('reports finished for a dead process whatever the hooks last said', () => {
    expect(resolveStatus({ ...hook, status: 'running' }, reg({ alive: false }), 2000)?.status).toBe('finished')
  })

  it('keeps hook state when there is no registry entry at all', () => {
    expect(resolveStatus(hook, undefined, 1000 + 60 * 60_000)?.status).toBe('waiting')
  })
})
