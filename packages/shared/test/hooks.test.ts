import { describe, expect, it } from 'vitest'
import { effectiveSettings, hooksFromLayers, safeUrl, SCOPE_PRECEDENCE, truncate, type SettingsLayer } from '../src/index'

const layer = (scope: SettingsLayer['scope'], data?: Record<string, unknown>): SettingsLayer => ({
  scope,
  path: `/${scope}.json`,
  exists: data !== undefined,
  data,
})

describe('hooksFromLayers', () => {
  it('flattens event → matcher group → handlers and records the source', () => {
    const hooks = hooksFromLayers(
      [
        layer('project', {
          hooks: {
            PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'npx prettier --write $FILE', timeout: 10 }] }],
            Stop: [{ hooks: [{ type: 'http', url: 'http://127.0.0.1:4777/hook' }] }],
          },
        }),
      ],
      SCOPE_PRECEDENCE,
    )
    expect(hooks).toEqual([
      { event: 'PostToolUse', matcher: 'Edit', type: 'command', summary: 'npx prettier --write $FILE', timeout: 10, sources: ['project'] },
      { event: 'Stop', type: 'http', summary: 'http://127.0.0.1:4777/hook', sources: ['project'] },
    ])
  })

  it('merges across scopes and collapses identical handlers, listing every source', () => {
    const same = { Stop: [{ hooks: [{ type: 'command', command: 'notify-send done' }] }] }
    const hooks = hooksFromLayers(
      [
        layer('user', { hooks: { ...same, PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './block.sh' }] }] } }),
        layer('project', { hooks: same }),
      ],
      SCOPE_PRECEDENCE,
    )
    expect(hooks).toHaveLength(2)
    expect(hooks.find((h) => h.event === 'Stop')?.sources).toEqual(['project', 'user'])
    expect(hooks.find((h) => h.event === 'PreToolUse')?.sources).toEqual(['user'])
  })

  it('treats the same command under a different matcher as a different hook', () => {
    const hooks = hooksFromLayers(
      [layer('user', { hooks: { PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] },
        { matcher: 'Edit', hooks: [{ type: 'command', command: 'x' }] },
      ] } })],
      SCOPE_PRECEDENCE,
    )
    expect(hooks).toHaveLength(2)
  })

  it('never exposes URL query strings, and shows only the type for unknown handlers', () => {
    const hooks = hooksFromLayers(
      [layer('user', { hooks: { Stop: [{ hooks: [
        { type: 'http', url: 'https://user:pw@example.com/hook?token=SECRET' },
        { type: 'mcp_tool', server: 'x', tool: 'y', secret: 'SECRET' },
      ] }] } })],
      SCOPE_PRECEDENCE,
    )
    expect(JSON.stringify(hooks)).not.toContain('SECRET')
    expect(JSON.stringify(hooks)).not.toContain('pw')
    expect(hooks.map((h) => h.summary)).toEqual(['https://example.com/hook', 'mcp_tool'])
  })

  it('ignores malformed shapes without throwing', () => {
    const bad: Record<string, unknown>[] = [
      { hooks: 'nope' },
      { hooks: { Stop: 'nope' } },
      { hooks: { Stop: [null, 3, { hooks: 'x' }, { hooks: [null, 'y', { nothing: true }] }] } },
    ]
    for (const data of bad) expect(() => hooksFromLayers([layer('user', data)], SCOPE_PRECEDENCE)).not.toThrow()
    expect(hooksFromLayers([layer('user', bad[2])], SCOPE_PRECEDENCE)).toEqual([
      { event: 'Stop', type: 'unknown', summary: 'unknown', sources: ['user'] },
    ])
  })

  it('is included in effectiveSettings and kept out of the generic values list', () => {
    const eff = effectiveSettings([layer('user', { model: 'x', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'c' }] }] } })])
    expect(eff.hooks).toHaveLength(1)
    expect(eff.values.map((v) => v.key)).toEqual(['model'])
  })
})

describe('hook secret redaction', () => {
  it('scrubs tokens and secret assignments from command summaries', () => {
    const token = 'ghp_' + 'Ab1'.repeat(12)
    const hooks = hooksFromLayers(
      [layer('user', { hooks: { Stop: [{ hooks: [{ type: 'command', command: `API_TOKEN=abcdef123456 curl -H "Authorization: Bearer ${'z'.repeat(24)}" ${token}` }] }] } })],
      SCOPE_PRECEDENCE,
    )
    const summary = hooks[0]?.summary ?? ''
    expect(summary).not.toContain('abcdef123456')
    expect(summary).not.toContain('z'.repeat(24))
    expect(summary).not.toContain(token)
    expect(summary).toContain('curl')
  })
})

describe('redact helpers', () => {
  it('safeUrl drops credentials, query and fragment', () => {
    expect(safeUrl('https://u:p@host.example:8080/a/b?x=1#f')).toBe('https://host.example:8080/a/b')
    expect(safeUrl('http://localhost:3000/')).toBe('http://localhost:3000')
    expect(safeUrl('not a url?token=SECRET')).toBe('not a url')
  })

  it('truncate adds an ellipsis only when needed', () => {
    expect(truncate('abc', 5)).toBe('abc')
    expect(truncate('abcdef', 4)).toBe('abc…')
  })
})
