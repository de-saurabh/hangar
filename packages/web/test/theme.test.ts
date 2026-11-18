import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, getTheme, NEXT, setTheme } from '../src/theme'

function stub(storage: 'ok' | 'blocked' = 'ok', initial?: string) {
  const store = new Map<string, string>(initial ? [['hangar-theme', initial]] : [])
  const attrs = new Map<string, string>()
  vi.stubGlobal(
    'localStorage',
    storage === 'blocked'
      ? { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
      : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  )
  vi.stubGlobal('document', { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) } })
  return { store, attrs }
}
afterEach(() => vi.unstubAllGlobals())

describe('theme', () => {
  it('cycles Auto → Light → Dark → Auto', () => {
    expect(NEXT.system).toBe('light')
    expect(NEXT.light).toBe('dark')
    expect(NEXT.dark).toBe('system')
  })

  it('defaults to system and ignores unknown stored values', () => {
    stub()
    expect(getTheme()).toBe('system')
    stub('ok', 'purple')
    expect(getTheme()).toBe('system')
  })

  it('remembers light and dark, and forgets on system', () => {
    const { store, attrs } = stub()
    setTheme('dark')
    expect(getTheme()).toBe('dark')
    expect(attrs.get('data-theme')).toBe('dark')
    setTheme('system')
    expect(store.has('hangar-theme')).toBe(false)
    expect(attrs.has('data-theme')).toBe(false)
  })

  it('still applies the theme when storage is blocked', () => {
    const { attrs } = stub('blocked')
    expect(getTheme()).toBe('system')
    expect(() => setTheme('light')).not.toThrow()
    expect(attrs.get('data-theme')).toBe('light')
  })

  it('applyTheme sets and clears the attribute', () => {
    const { attrs } = stub()
    applyTheme('light')
    expect(attrs.get('data-theme')).toBe('light')
    applyTheme('system')
    expect(attrs.has('data-theme')).toBe(false)
  })
})
