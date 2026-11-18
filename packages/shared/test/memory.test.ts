import { describe, expect, it } from 'vitest'
import { estimateTokens } from '../src/index'

describe('estimateTokens', () => {
  it('is chars / 4, rounded up', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('x'.repeat(4800))).toBe(1200)
  })
})
