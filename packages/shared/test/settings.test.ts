import { describe, expect, it } from 'vitest'
import { effectiveSettings, flatten, MASK, maskSensitiveValues, valuesForScope, type SettingsLayer } from '../src/index'

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

describe('valuesForScope', () => {
  const eff = effectiveSettings([
    layer('user', { model: 'sonnet', outputStyle: 'concise' }),
    layer('project', { model: 'opus' }),
  ])

  it('lists what a layer sets and flags values a higher layer overrides', () => {
    expect(valuesForScope(eff.values, 'project')).toEqual([{ key: 'model', value: 'opus' }])
    expect(valuesForScope(eff.values, 'user')).toEqual([
      { key: 'model', value: 'sonnet', overriddenBy: 'project' },
      { key: 'outputStyle', value: 'concise' },
    ])
  })

  it('is empty for a layer that sets nothing', () => {
    expect(valuesForScope(eff.values, 'local')).toEqual([])
  })
})

describe('maskSensitiveValues', () => {
  const token = 'ghp_' + 'Ab1'.repeat(12)
  const eff = effectiveSettings([
    layer('user', { env: { API_KEY: 'user-secret-value', NODE_ENV: 'production' }, model: 'sonnet' }),
    layer('project', { env: { API_KEY: 'project-secret-value', NODE_ENV: 'development' }, other: token }),
  ])

  it('masks the winning value and the overridden ones, keeping keys and sources', () => {
    const masked = maskSensitiveValues(eff.values)
    const key = masked.find((v) => v.key === 'env.API_KEY')
    expect(key).toMatchObject({ value: MASK, masked: true, source: 'project' })
    expect(key?.overrides).toEqual([{ source: 'user', value: MASK, masked: true }])
    expect(JSON.stringify(masked)).not.toContain('secret-value')
    expect(JSON.stringify(masked)).not.toContain(token)
  })

  it('leaves ordinary values untouched and does not mutate its input', () => {
    const before = JSON.stringify(eff.values)
    const masked = maskSensitiveValues(eff.values)
    expect(masked.find((v) => v.key === 'env.NODE_ENV')).toMatchObject({ value: 'development' })
    expect(masked.find((v) => v.key === 'env.NODE_ENV')?.masked).toBeUndefined()
    expect(JSON.stringify(eff.values)).toBe(before)
  })

  it('carries the mask through the per-scope view', () => {
    const masked = maskSensitiveValues(eff.values)
    expect(valuesForScope(masked, 'user').find((r) => r.key === 'env.API_KEY')).toEqual({ key: 'env.API_KEY', value: MASK, masked: true, overriddenBy: 'project' })
    expect(valuesForScope(masked, 'project').find((r) => r.key === 'other')).toMatchObject({ masked: true })
  })
})
