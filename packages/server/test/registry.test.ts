import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isAlive, read } from '../src/sources/registry.js'

let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'hangar-registry-'))
  await mkdir(join(home, 'sessions'))
})
afterEach(() => rm(home, { recursive: true, force: true }))

const put = (name: string, body: string) => writeFile(join(home, 'sessions', name), body)

describe('registry.read', () => {
  it('returns [] when the sessions folder is missing', async () => {
    expect(await read(join(home, 'nowhere'))).toEqual([])
  })

  it('reads the fields Hangar needs and checks liveness', async () => {
    await put('11.json', JSON.stringify({ pid: 11, sessionId: 's1', status: 'busy', cwd: '/r', name: 'n', secret: 'x' }))
    expect(await read(home, (pid) => pid === 11)).toEqual([{ sessionId: 's1', pid: 11, alive: true, status: 'busy', cwd: '/r', name: 'n' }])
  })

  it('takes the pid from the file name when the body has none', async () => {
    await put('42.json', JSON.stringify({ sessionId: 's2' }))
    expect((await read(home, () => false))[0]).toMatchObject({ pid: 42, alive: false })
  })

  it('skips bad JSON, entries without a session id, and never opens .key files', async () => {
    await put('1.json', '{ half written')
    await put('2.json', JSON.stringify({ pid: 2 }))
    await put('3.key', JSON.stringify({ pid: 3, sessionId: 'secret' }))
    await put('4.json', JSON.stringify({ pid: 4, sessionId: 'ok' }))
    expect((await read(home, () => true)).map((e) => e.sessionId)).toEqual(['ok'])
  })
})

describe('isAlive', () => {
  it('is true for this process and false for an impossible pid', () => {
    expect(isAlive(process.pid)).toBe(true)
    expect(isAlive(2 ** 22 + 12345)).toBe(false)
  })
})
