import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Repo } from '@hangar/shared'
import { ApprovalTracker } from '../src/approvals.js'

let dir: string
let file: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hangar-appr-'))
  file = join(dir, 'approvals.json')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const repo = (id: string, name: string, path: string): Repo => ({ id, name, path, addedAt: '' })
const ask = (command: string, session = 's1', cwd = '/work/api') => ({ session_id: session, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command }, cwd })
const done = (session = 's1', tool = 'Bash') => ({ session_id: session, hook_event_name: 'PostToolUse', tool_name: tool })
const none = () => false

async function approve(t: ApprovalTracker, command: string, times: number, cwd?: string) {
  for (let i = 0; i < times; i++) {
    await t.ingest(ask(command, 's1', cwd))
    await t.ingest(done())
  }
}

describe('ApprovalTracker', () => {
  it('counts a prompt only once the same call finishes, and suggests after 3 approvals', async () => {
    const t = new ApprovalTracker(() => file)
    await approve(t, 'npm test -- a', 2)
    expect(await t.suggestions([], none)).toEqual([])
    await approve(t, 'npm test -- b', 1)
    expect(await t.suggestions([], none)).toMatchObject([{ rule: 'Bash(npm test:*)', approvals: 3, risky: false, scope: 'global' }])
  })

  it('does not count denied or abandoned prompts', async () => {
    const t = new ApprovalTracker(() => file)
    for (let i = 0; i < 5; i++) {
      await t.ingest(ask('npm test'))
      await t.ingest({ session_id: 's1', hook_event_name: 'UserPromptSubmit' }) // moved on: not approved
    }
    await t.ingest(ask('npm test'))
    await t.ingest({ session_id: 's1', hook_event_name: 'Stop' })
    expect(await t.suggestions([], none)).toEqual([])
  })

  it('ignores a completion for a different tool or tool_use_id', async () => {
    const t = new ApprovalTracker(() => file)
    for (let i = 0; i < 3; i++) {
      await t.ingest({ ...ask('npm test'), tool_use_id: 'a' })
      await t.ingest({ ...done(), tool_use_id: 'b' })
      await t.ingest(ask('npm test'))
      await t.ingest(done('s1', 'Read'))
    }
    expect(await t.suggestions([], none)).toEqual([])
  })

  it('skips commands that cannot be expressed safely and keeps sessions apart', async () => {
    const t = new ApprovalTracker(() => file)
    for (let i = 0; i < 4; i++) {
      await t.ingest(ask('npm test && rm -rf x'))
      await t.ingest(done())
    }
    await t.ingest(ask('ls', 'a'))
    await t.ingest(done('b')) // another session finishing does not confirm it
    expect(await t.suggestions([], none)).toEqual([])
  })

  it('flags risky rules and omits ones already allowed', async () => {
    const t = new ApprovalTracker(() => file)
    await approve(t, 'git push origin main', 3)
    await approve(t, 'npm test', 3)
    const all = await t.suggestions([], none)
    expect(all.find((s) => s.rule === 'Bash(git push:*)')?.risky).toBe(true)
    const filtered = await t.suggestions([], (rule) => rule === 'Bash(npm test:*)')
    expect(filtered.map((s) => s.rule)).toEqual(['Bash(git push:*)'])
  })

  it('scopes to one repo when it accounts for nearly all approvals, otherwise global', async () => {
    const api = repo('r1', 'api-server', '/work/api')
    const web = repo('r2', 'web-app', '/work/web')
    const t = new ApprovalTracker(() => file)
    await approve(t, 'npm run db:migrate', 5, '/work/api/src')
    await approve(t, 'npm test', 2, '/work/api')
    await approve(t, 'npm test', 2, '/work/web')
    const s = await t.suggestions([api, web], none)
    expect(s.find((x) => x.rule === 'Bash(npm run:*)')?.scope).toEqual({ repoId: 'r1', repoName: 'api-server' })
    const test = s.find((x) => x.rule === 'Bash(npm test:*)')
    expect(test?.scope).toBe('global')
    expect(test?.repos).toEqual(expect.arrayContaining(['api-server', 'web-app']))
  })

  it('persists counters across instances and tolerates a corrupt file', async () => {
    const a = new ApprovalTracker(() => file)
    await approve(a, 'npm test', 3)
    await a.flush()
    expect(JSON.parse(await readFile(file, 'utf8')).rules[0]).toMatchObject({ rule: 'Bash(npm test:*)', total: 3 })
    expect(await new ApprovalTracker(() => file).suggestions([], none)).toHaveLength(1)

    await rm(file)
    await (await import('node:fs/promises')).writeFile(file, '{not json')
    expect(await new ApprovalTracker(() => file).suggestions([], none)).toEqual([])
  })

  it('never stores prompt text or command arguments, only the rule and working dir', async () => {
    const t = new ApprovalTracker(() => file)
    await approve(t, 'npm test -- --token=SUPERSECRET123', 3, '/work/api')
    await t.flush()
    expect(await readFile(file, 'utf8')).not.toContain('SUPERSECRET123')
  })
})
