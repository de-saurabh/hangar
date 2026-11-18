import { describe, expect, it } from 'vitest'
import { formatCost, formatDuration, formatTokens, offsetLabel, shortModel } from '../src/format'

describe('format', () => {
  it('formats cost', () => {
    expect(formatCost(undefined)).toBe('—')
    expect(formatCost(0.004)).toBe('<$0.01')
    expect(formatCost(0)).toBe('$0.00')
    expect(formatCost(36.2599)).toBe('$36.26')
  })

  it('formats token counts', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1234)).toBe('1.2k')
    expect(formatTokens(73_000)).toBe('73k')
    expect(formatTokens(2_300_000)).toBe('2.3M')
  })

  it('shortens model ids', () => {
    expect(shortModel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(shortModel('claude-sonnet-5')).toBe('Sonnet 5')
    expect(shortModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(shortModel('gpt-whatever')).toBe('gpt-whatever')
    expect(shortModel(undefined)).toBe('unknown model')
  })

  it('formats durations', () => {
    const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString()
    expect(formatDuration(t(0), t(45))).toBe('45 s')
    expect(formatDuration(t(0), t(720))).toBe('12 min')
    expect(formatDuration(t(0), t(3900))).toBe('1 h 05')
    expect(formatDuration(undefined, t(1))).toBe('')
    expect(formatDuration(t(10), t(0))).toBe('')
  })

  it('labels event offsets', () => {
    const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString()
    expect(offsetLabel(t(0), t(9))).toBe('0:09')
    expect(offsetLabel(t(0), t(3912))).toBe('1:05:12')
    expect(offsetLabel(undefined, t(9))).toBe('')
  })
})
