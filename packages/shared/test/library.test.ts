import { describe, expect, it } from 'vitest'
import { firstLine, readFrontMatter } from '../src/index'

describe('readFrontMatter', () => {
  it('reads simple, quoted and folded values', () => {
    const t = '---\nname: reviewer\ndescription: "Reviews diffs"\ntools: Read, Grep\nlong: >\n  first part\n  second part\n---\nbody'
    expect(readFrontMatter(t)).toEqual({ name: 'reviewer', description: 'Reviews diffs', tools: 'Read, Grep', long: 'first part second part' })
  })

  it('returns {} without front matter or with an unterminated block', () => {
    expect(readFrontMatter('# just a heading')).toEqual({})
    expect(readFrontMatter('---\nname: x\nno end')).toEqual({})
    expect(readFrontMatter('')).toEqual({})
  })

  it('handles CRLF and a BOM', () => {
    expect(readFrontMatter('\uFEFF---\r\ndescription: hi\r\n---\r\nbody')).toEqual({ description: 'hi' })
  })
})

describe('firstLine', () => {
  it('skips front matter and heading marks', () => {
    expect(firstLine('---\na: b\n---\n\n# Deploy the app\nmore')).toBe('Deploy the app')
    expect(firstLine('')).toBe('')
  })
})
