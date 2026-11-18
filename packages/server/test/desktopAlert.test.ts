import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { listenSafe } from './helpers.js'

let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'hangar-alert-'))
  process.env.HANGAR_HOME = home
})
afterEach(async () => {
  delete process.env.HANGAR_HOME
  await rm(home, { recursive: true, force: true })
})

describe('desktop alerts end to end', () => {
  it('fires only when enabled, and only for sessions that start waiting', async () => {
    const sent: [string, string][] = []
    const server = await listenSafe(createApp({ version: 't', claudeHome: home, startLive: true, sendDesktop: (t, m) => sent.push([t, m]) }))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const hook = (body: object) => fetch(`${base}/api/hook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const settle = () => new Promise((r) => setTimeout(r, 100))
    try {
      // Off by default: no alert.
      await hook({ session_id: 'a', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: '/work/api' })
      await settle()
      expect(sent).toEqual([])

      await fetch(`${base}/api/prefs`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ desktopAlerts: true }) })
      await hook({ session_id: 'b', hook_event_name: 'UserPromptSubmit', cwd: '/work/web' })
      await settle()
      expect(sent).toEqual([]) // running is not an alert

      await hook({ session_id: 'b', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf dist' }, cwd: '/work/web' })
      await settle()
      expect(sent).toEqual([['web needs you', 'Bash: rm -rf dist']])
    } finally {
      server.closeAllConnections()
      await new Promise((r) => server.close(r))
    }
  })
})
