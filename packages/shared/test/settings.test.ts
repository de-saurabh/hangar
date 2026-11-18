import { describe, expect, it } from 'vitest'
import { effectiveSettings, flatten, type SettingsLayer } from '../src/index'

const layer = (scope: SettingsLayer['scope'], data?: Record<string, unknown>): SettingsLayer => ({
  scope,
  path: `/${scope}.json`,
  exists: data !== undefined,
  data,
})

describe('flatten', () => {
  it('flattens nested objects, keeps arrays and empty objects as leaves, skips merge-type keys', () => {
    const flat = flatten({ a: { b: 1, c: { d: 2 } }, arr: [1, 2], empty: {}, hooks: { x: 1 }, permissions: { allow: ['x'], defaultMode: 'm' } })
    expect([...flat.entries()]).toEqual([
      ['a.b', 1],
      ['a.c.d', 2],
      ['arr', [1, 2]],
      ['empty', {}],
      ['permissions.defaultMode', 'm'],
    ])
  })
})

describe('effectiveSettings', () => {
  it('local > project > user, recording what each winner overrode', () => {
    const eff = effectiveSettings([
      layer('user', { model: 'sonnet', cleanupPeriodDays: 30 }),
      layer('project', { model: 'opus' }),
      layer('local', { model: 'haiku' }),
    ])
    const model = eff.values.find((v) => v.key === 'model')
    expect(model).toMatchObject({ value: 'haiku', source: 'local' })
    expect(model?.overrides).toEqual([
      { source: 'project', value: 'opus' },
      { source: 'user', value: 'sonnet' },
    ])
    expect(eff.values.find((v) => v.key === 'cleanupPeriodDays')).toMatchObject({ source: 'user', overrides: [] })
  })

  it('managed beats everything, regardless of input order', () => {
    const eff = effectiveSettings([layer('local', { model: 'a' }), layer('managed', { model: 'b' }), layer('user', { model: 'c' })])
    expect(eff.values[0]).toMatchObject({ value: 'b', source: 'managed' })
  })

  it('merges permission rules across scopes and tracks every source', () => {
    const eff = effectiveSettings([
      layer('user', { permissions: { allow: ['Bash(npm test:*)', 'Bash(git status)'], deny: ['Read(.env*)'] } }),
      layer('project', { permissions: { allow: ['Bash(npm test:*)', 'Edit(src/**)'] } }),
      layer('local', { permissions: { ask: ['Bash(git push:*)'] } }),
    ])
    expect(eff.permissions.allow).toEqual([
      { rule: 'Bash(npm test:*)', sources: ['project', 'user'] },
      { rule: 'Edit(src/**)', sources: ['project'] },
      { rule: 'Bash(git status)', sources: ['user'] },
    ])
    expect(eff.permissions.deny).toEqual([{ rule: 'Read(.env*)', sources: ['user'] }])
    expect(eff.permissions.ask).toEqual([{ rule: 'Bash(git push:*)', sources: ['local'] }])
  })

  it('ignores layers without data and non-string rules, and never throws on odd shapes', () => {
    const eff = effectiveSettings([
      layer('user', { permissions: { allow: ['ok', 42, null] }, weird: null }),
      { scope: 'project', path: '/p', exists: true, error: 'Invalid JSON' },
      layer('local'),
    ])
    expect(eff.permissions.allow).toEqual([{ rule: 'ok', sources: ['user'] }])
    expect(eff.layers.find((l) => l.scope === 'project')?.error).toBe('Invalid JSON')
  })
})
