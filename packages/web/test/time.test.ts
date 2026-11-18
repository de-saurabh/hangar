import { describe, expect, it } from 'vitest'
import { dayLabel, elapsed, timeAgo } from '../src/time'

const NOW = new Date('2026-11-18T12:00:00').getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000
const H = 60 * MIN
const D = 24 * H

describe('timeAgo', () => {
  it.each([
    [0, 'just now'],
    [59_000, 'just now'],
    [5 * MIN, '5 min ago'],
    [59 * MIN, '59 min ago'],
    [3 * H, '3 h ago'],
    [23 * H, '23 h ago'],
    [1 * D, 'yesterday'],
    [4 * D, '4 days ago'],
    [13 * D, '13 days ago'],
  ])('%i ms ago reads "%s"', (ms, text) => {
    expect(timeAgo(ago(ms), NOW)).toBe(text)
  })

  it('shows a date once it is two weeks old', () => {
    expect(timeAgo(ago(20 * D), NOW)).toMatch(/\d/)
    expect(timeAgo(ago(20 * D), NOW)).not.toContain('ago')
  })

  it('is empty for an unparseable date', () => {
    expect(timeAgo('not a date', NOW)).toBe('')
  })
})

describe('elapsed', () => {
  it('drops the "ago"', () => {
    expect(elapsed(Date.now() - 12 * MIN)).toBe('12 min')
    expect(elapsed(Date.now() - 3 * H)).toBe('3 h')
  })
})

describe('dayLabel', () => {
  const now = new Date('2026-11-18T12:00:00')
  it('groups into Today, Yesterday, a weekday, then a date', () => {
    expect(dayLabel('2026-11-18T01:00:00', now)).toBe('Today')
    expect(dayLabel('2026-11-17T23:00:00', now)).toBe('Yesterday')
    expect(dayLabel('2026-11-14T10:00:00', now)).toBe(new Date('2026-11-14T10:00:00').toLocaleDateString(undefined, { weekday: 'long' }))
    expect(dayLabel('2026-10-03T10:00:00', now)).toBe(new Date('2026-10-03T10:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
  })

  it('files a missing or broken date under Earlier', () => {
    expect(dayLabel(undefined, now)).toBe('Earlier')
    expect(dayLabel('garbage', now)).toBe('Earlier')
  })

  it('treats a future time as Today rather than failing', () => {
    expect(dayLabel('2026-11-19T10:00:00', now)).toBe('Today')
  })
})
