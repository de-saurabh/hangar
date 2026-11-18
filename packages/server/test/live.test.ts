import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LiveState } from '@hangar/shared'
import { LiveStore, type LiveTransition } from '../src/live.js'
import { read as readRegistry } from '../src/sources/registry.js'

let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'hangar-live-'))
  await mkdir(join(home, 'sessions'), { recursive: true })
})
afterEach(() => rm(home, { recursive: true, force: true }))

const reg = (name: string, o: object) => writeFile(join(home, 'sessions', name), JSON.stringify(o))

describe('registry adapter', () => {
  it('keeps only needed fields, checks liveness, skips .key and bad files', async () => {
    await reg('100.json', { pid: 100, sessionId: 'a', status: 'busy', cwd: '/x', messagingSocketPath: 'SECRET-SOCKET' })
    await reg('200.json', { pid: 200, sessionId: 'b', status: 'idle' })
    await reg('100.key', { pid: 1, sessionId: 'nope' })
    await reg('300.json', { not: 'a session' })
    await writeFile(join(home, 'sessions', '400.json'), '{"half":')
    const out = await readRegistry(home, (pid) => pid === 100)
    expect(out).toEqual([
      { sessionId: 'a', pid: 100, alive: true, status: 'busy', cwd: '/x' },
      { sessionId: 'b', pid: 200, alive: false, status: 'idle' },
    ])
    expect(JSON.stringify(out)).not.toContain('SECRET-SOCKET')
  })

  it('returns [] when there is no sessions directory', async () => {
    expect(await readRegistry(join(home, 'missing'))).toEqual([])
  })
})

describe('LiveStore', () => {
  it('shows registry sessions without hooks and reports alive status', async () => {
    await reg(`${process.pid}.json`, { pid: process.pid, sessionId: 'a', status: 'busy', cwd: '/x' })
    const live = new LiveStore(home)
    await live.poll()
    expect(live.snapshot()).toMatchObject([{ sessionId: 'a', status: 'running' }])
  })

  it('applies hook events, emits updates and a transition into waiting', async () => {
    let t = 1000
    const live = new LiveStore(home, () => t)
    const updates: LiveState[][] = []
    const transitions: LiveTransition[] = []
    live.on('update', (s) => updates.push(s))
    live.on('transition', (x) => transitions.push(x))

    live.ingest({ session_id: 's1', hook_event_name: 'UserPromptSubmit', cwd: '/repo' })
    t = 2000
    live.ingest({ session_id: 's1', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf build' } })

    expect(live.snapshot()).toMatchObject([{ sessionId: 's1', status: 'waiting', detail: 'Bash: rm -rf build', cwd: '/repo' }])
    expect(transitions.map((x) => [x.from, x.to])).toEqual([[undefined, 'running'], ['running', 'waiting']])
    expect(updates.length).toBeGreaterThanOrEqual(2)
  })

  it('does not alert for sessions merely discovered on the first poll', async () => {
    await reg(`${process.pid}.json`, { pid: process.pid, sessionId: 'a', status: 'busy' })
    const live = new LiveStore(home)
    const transitions: LiveTransition[] = []
    live.on('transition', (x) => transitions.push(x))
    await live.poll()
    expect(transitions).toEqual([])
  })

  it('marks a hooked session finished when its process disappears', async () => {
    await reg('999999.json', { pid: 999999, sessionId: 's1', status: 'busy' }) // not a live pid
    const live = new LiveStore(home)
    live.ingest({ session_id: 's1', hook_event_name: 'UserPromptSubmit' })
    await live.poll()
    expect(live.snapshot()[0]?.status).toBe('finished')
  })

  it('ignores payloads without a session id and never stores prompt text', () => {
    const live = new LiveStore(home)
    live.ingest({ hook_event_name: 'Stop' })
    live.ingest({ session_id: 's1', hook_event_name: 'UserPromptSubmit', prompt: 'my secret prompt' } as never)
    expect(JSON.stringify(live.snapshot())).not.toContain('secret prompt')
    expect(live.snapshot()).toHaveLength(1)
  })
})
