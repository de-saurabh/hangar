import { describe, expect, it } from 'vitest'
import { repoWarnings, type MemoryFile } from '../src/index'

const mem = (over: Partial<MemoryFile>): MemoryFile => ({ kind: 'project', path: '/r/CLAUDE.md', label: 'CLAUDE.md', exists: true, tokens: 100, ...over })
const noPerms = { allow: [], deny: [], ask: [] }

describe('repoWarnings', () => {
  it('flags a large always-loaded CLAUDE.md, ignoring nested and missing ones', () => {
    expect(repoWarnings([mem({ tokens: 6100 })], noPerms)).toEqual(['CLAUDE.md is ~6.1k tokens, loaded every session'])
    expect(repoWarnings([mem({ kind: 'nested', tokens: 9000 }), mem({ exists: false, tokens: 9000 }), mem({ tokens: 3999 })], noPerms)).toEqual([])
  })

  it('names the largest when several are large', () => {
    const w = repoWarnings([mem({ label: 'a', tokens: 4500 }), mem({ label: 'b', tokens: 8000 })], noPerms)
    expect(w).toEqual(['b is ~8.0k tokens, loaded every session'])
  })

  it('flags broad allow rules with the scope that grants them', () => {
    const perms = { ...noPerms, allow: [{ rule: 'Bash(*)', sources: ['local' as const] }] }
    expect(repoWarnings([], perms)).toEqual(['settings.local.json allows Bash(*)'])
    expect(repoWarnings([], { ...noPerms, allow: [{ rule: '*', sources: ['user' as const] }] })).toEqual(['User settings allows every tool'])
  })

  it('does not flag narrow rules', () => {
    const perms = { ...noPerms, allow: [{ rule: 'Bash(npm test:*)', sources: ['project' as const] }, { rule: 'Read', sources: ['user' as const] }] }
    expect(repoWarnings([], perms)).toEqual([])
  })
})
