import { describe, expect, it } from 'vitest'
import { createAlerter } from '../src/notify.js'

describe('createAlerter', () => {
  it('alerts on waiting with folder name and detail, ignores other transitions', () => {
    const sent: [string, string][] = []
    const alert = createAlerter((t, m) => sent.push([t, m]))
    expect(alert({ sessionId: 'a', from: 'running', to: 'running' })).toBe(false)
    expect(alert({ sessionId: 'a', from: 'running', to: 'idle' })).toBe(false)
    expect(alert({ sessionId: 'a', from: 'running', to: 'waiting', detail: 'Bash: npm run db:migrate', cwd: 'D:\\code\\api-server' })).toBe(true)
    expect(sent).toEqual([['api-server needs you', 'Bash: npm run db:migrate']])
  })

  it('falls back to generic text without cwd or detail', () => {
    const sent: [string, string][] = []
    createAlerter((t, m) => sent.push([t, m]))({ sessionId: 'a', from: undefined, to: 'waiting' })
    expect(sent).toEqual([['A Claude session needs you', 'Waiting for your input']])
  })

  it('rate-limits per session but not across sessions', () => {
    let t = 0
    const sent: string[] = []
    const alert = createAlerter((title) => sent.push(title), 30_000, () => t)
    const w = (id: string) => alert({ sessionId: id, from: 'running', to: 'waiting', cwd: `/r/${id}` })
    expect(w('a')).toBe(true)
    t = 10_000
    expect(w('a')).toBe(false)
    expect(w('b')).toBe(true)
    t = 31_000
    expect(w('a')).toBe(true)
    expect(sent).toEqual(['a needs you', 'b needs you', 'a needs you'])
  })
})
