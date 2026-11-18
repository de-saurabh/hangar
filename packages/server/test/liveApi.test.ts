import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LiveState } from '@hangar/shared'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

let home: string
let server: Server
let base: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'hangar-liveapi-'))
  server = await listenSafe(createApp({ version: 'test', claudeHome: home }))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(home, { recursive: true, force: true })
})

const post = (body: unknown) => fetch(`${base}/api/hook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('hook endpoint', () => {
  it('accepts a hook event and reflects it in /api/live', async () => {
    const res = await post({ session_id: 's1', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: '/r' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
    const live = (await (await fetch(`${base}/api/live`)).json()) as LiveState[]
    expect(live).toMatchObject([{ sessionId: 's1', status: 'waiting', detail: 'Bash: ls' }])
  })

  it('answers 200 even for junk so a hook never fails because of Hangar', async () => {
    expect((await post('just a string')).status).toBe(200)
    expect((await fetch(`${base}/api/hook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' })).status).toBe(200)
    expect(await (await fetch(`${base}/api/live`)).json()).toEqual([])
  })

  it('accepts very large payloads (e.g. a Write tool input)', async () => {
    const big = 'x'.repeat(2_000_000)
    const res = await post({ session_id: 's2', hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'a.ts', content: big } })
    expect(res.status).toBe(200)
    const live = (await (await fetch(`${base}/api/live`)).json()) as LiveState[]
    expect(live[0]?.detail).toBe('Write: a.ts')
  })
})

describe('events stream', () => {
  it('sends a snapshot on connect and a live event after a hook', async () => {
    const ctrl = new AbortController()
    const res = await fetch(`${base}/api/events`, { signal: ctrl.signal })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''
    const until = async (pred: (b: string) => boolean) => {
      while (!pred(buf)) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value)
      }
    }
    await until((b) => b.includes('event: live'))
    await post({ session_id: 's3', hook_event_name: 'UserPromptSubmit' })
    await until((b) => b.includes('"s3"'))
    ctrl.abort()
    expect(buf).toContain('event: live')
    expect(buf).toContain('"status":"running"')
  })
})

describe('hook install api', () => {
  const get = async () => (await (await fetch(`${base}/api/hooks/install`)).json()) as { action: string; token: string; diff: string; installed: boolean }
  const send = (body: unknown) => fetch(`${base}/api/hooks/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

  it('previews, applies with the token, then offers uninstall', async () => {
    process.env.HANGAR_HOME = home
    const p = await get()
    expect(p).toMatchObject({ action: 'install', installed: false })
    expect(p.diff).toContain('/api/hook?src=hangar')
    expect((await send({ action: 'install', token: p.token })).status).toBe(200)
    expect(await get()).toMatchObject({ action: 'uninstall', installed: true })
    delete process.env.HANGAR_HOME
  })

  it('rejects a bad body (400) and a stale token (409)', async () => {
    process.env.HANGAR_HOME = home
    expect((await send({ action: 'nuke', token: 'x' })).status).toBe(400)
    expect((await send({ action: 'install', token: 'stale' })).status).toBe(409)
    delete process.env.HANGAR_HOME
  })
})

describe('prefs and desktop alerts', () => {
  it('stores prefs, defaulting desktop alerts off, and validates the body', async () => {
    process.env.HANGAR_HOME = home
    expect(await (await fetch(`${base}/api/prefs`)).json()).toMatchObject({ desktopAlerts: false })
    const put = (body: unknown) => fetch(`${base}/api/prefs`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    expect(await (await put({ desktopAlerts: true })).json()).toMatchObject({ desktopAlerts: true })
    expect(await (await fetch(`${base}/api/prefs`)).json()).toMatchObject({ desktopAlerts: true })
    expect((await put({ desktopAlerts: 'yes' })).status).toBe(400)
    expect((await put({ other: 1 })).status).toBe(400)
    delete process.env.HANGAR_HOME
  })
})
