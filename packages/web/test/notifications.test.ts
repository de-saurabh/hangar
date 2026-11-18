import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyEnabled, raiseAlert, setNotify, type Transition } from '../src/live'

/** Minimal browser stand-ins; the tests run in node. */
function stubBrowser(opts: { permission?: NotificationPermission; request?: NotificationPermission; storage?: 'ok' | 'blocked' } = {}) {
  const store = new Map<string, string>()
  const shown: { title: string; options?: NotificationOptions }[] = []
  vi.stubGlobal(
    'localStorage',
    opts.storage === 'blocked'
      ? { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
      : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  )
  class FakeNotification {
    static permission: NotificationPermission = opts.permission ?? 'default'
    static requestPermission = vi.fn(async () => (FakeNotification.permission = opts.request ?? 'granted'))
    constructor(title: string, options?: NotificationOptions) {
      shown.push({ title, options })
    }
  }
  vi.stubGlobal('Notification', FakeNotification)
  return { store, shown, Notification: FakeNotification }
}

afterEach(() => vi.unstubAllGlobals())

const waiting = (over: Partial<Transition> = {}): Transition => ({ sessionId: 's1', from: 'running', to: 'waiting', cwd: 'D:\\code\\api-server', detail: 'Bash: npm test', ...over })

describe('setNotify / notifyEnabled', () => {
  it('is off until switched on', () => {
    stubBrowser({ permission: 'granted' })
    expect(notifyEnabled()).toBe(false)
  })

  it('asks for permission, then turns on and stays on', async () => {
    const b = stubBrowser()
    expect(await setNotify(true)).toBe(true)
    expect(b.Notification.requestPermission).toHaveBeenCalledOnce()
    expect(notifyEnabled()).toBe(true)
  })

  it('does not ask again when permission is already granted', async () => {
    const b = stubBrowser({ permission: 'granted' })
    expect(await setNotify(true)).toBe(true)
    expect(b.Notification.requestPermission).not.toHaveBeenCalled()
  })

  it('stays off when the browser denies permission', async () => {
    const b = stubBrowser({ request: 'denied' })
    expect(await setNotify(true)).toBe(false)
    expect(b.store.has('hangar.notify')).toBe(false)
    expect(notifyEnabled()).toBe(false)
  })

  it('turns off again, and notifyEnabled follows', async () => {
    stubBrowser({ permission: 'granted' })
    await setNotify(true)
    expect(await setNotify(false)).toBe(false)
    expect(notifyEnabled()).toBe(false)
  })

  it('is off, not an error, when notifications are unsupported', async () => {
    stubBrowser()
    vi.stubGlobal('Notification', undefined)
    expect(await setNotify(true)).toBe(false)
    expect(notifyEnabled()).toBe(false)
  })

  it('is off, not an error, when storage is blocked', async () => {
    stubBrowser({ permission: 'granted', storage: 'blocked' })
    expect(notifyEnabled()).toBe(false)
    expect(await setNotify(true)).toBe(false)
  })
})

describe('raiseAlert', () => {
  let b: ReturnType<typeof stubBrowser>
  beforeEach(async () => {
    b = stubBrowser({ permission: 'granted' })
    await setNotify(true)
  })

  it('shows the folder name and what it is waiting for', () => {
    expect(raiseAlert(waiting(), new Map(), 1000)).toBe(true)
    expect(b.shown).toEqual([{ title: 'api-server needs you', options: { body: 'Bash: npm test', tag: 's1' } }])
  })

  it('falls back to generic text without cwd or detail', () => {
    raiseAlert(waiting({ cwd: undefined, detail: undefined }), new Map(), 1000)
    expect(b.shown[0]).toMatchObject({ title: 'A session needs you', options: { body: 'Waiting for your input' } })
  })

  it('ignores everything except a session starting to wait', () => {
    expect(raiseAlert(waiting({ to: 'running' }), new Map())).toBe(false)
    expect(raiseAlert(waiting({ to: 'finished' }), new Map())).toBe(false)
    expect(b.shown).toEqual([])
  })

  it('stays quiet when alerts are off', async () => {
    await setNotify(false)
    expect(raiseAlert(waiting(), new Map())).toBe(false)
    expect(b.shown).toEqual([])
  })

  it('rate-limits per session for 30 s but not across sessions', () => {
    const seen = new Map<string, number>()
    expect(raiseAlert(waiting(), seen, 0)).toBe(true)
    expect(raiseAlert(waiting(), seen, 29_999)).toBe(false)
    expect(raiseAlert(waiting({ sessionId: 's2' }), seen, 29_999)).toBe(true)
    expect(raiseAlert(waiting(), seen, 30_000)).toBe(true)
    expect(b.shown).toHaveLength(3)
  })

  it('survives a browser that throws from the Notification constructor', () => {
    vi.stubGlobal('Notification', Object.assign(function () { throw new TypeError('Illegal constructor') }, { permission: 'granted' }))
    expect(() => raiseAlert(waiting(), new Map(), 0)).not.toThrow()
  })
})
