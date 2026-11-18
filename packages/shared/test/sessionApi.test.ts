import { describe, expect, it } from 'vitest'
import { isInside, lastSegment } from '../src/index'

describe('isInside', () => {
  it('matches the folder itself and anything below it, ignoring separators and case', () => {
    expect(isInside('D:\\Code\\App', 'd:/code/app')).toBe(true)
    expect(isInside('D:/Code/App/src/db', 'D:\\Code\\App')).toBe(true)
    expect(isInside('D:/Code/App/', 'D:/Code/App')).toBe(true)
  })

  it('does not match siblings that merely share a prefix', () => {
    expect(isInside('D:/Code/App2', 'D:/Code/App')).toBe(false)
    expect(isInside('D:/Code', 'D:/Code/App')).toBe(false)
  })

  it('can be case-sensitive and never matches an empty parent', () => {
    expect(isInside('/a/B', '/a/b', false)).toBe(false)
    expect(isInside('/a/b', '')).toBe(false)
  })
})

describe('lastSegment', () => {
  it('handles Windows and POSIX paths and trailing separators', () => {
    expect(lastSegment('C:\\code\\demo')).toBe('demo')
    expect(lastSegment('/home/me/proj/')).toBe('proj')
    expect(lastSegment('')).toBe('')
  })
})
