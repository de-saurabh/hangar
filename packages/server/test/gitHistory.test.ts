import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { currentBranch, parseLog, recentMemoryChanges } from '../src/sources/gitHistory.js'

let dir: string
const git = (...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hangar-git-'))
  git('init', '-q', '-b', 'main')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('parseLog', () => {
  it('parses commits with numstat lines, binary markers and tabs in subjects', () => {
    const out = '\x1eabcdef1234567\t1700000000\tAdd rules\n3\t1\tCLAUDE.md\n-\t-\tsrc/CLAUDE.md\n\x1e999\tnot-a-number\tbad\n1\t1\tx\n'
    const c = parseLog(out)
    expect(c).toEqual([
      { commit: 'abcdef1', date: '2023-11-14T22:13:20.000Z', subject: 'Add rules', file: 'CLAUDE.md', added: 3, removed: 1 },
      { commit: 'abcdef1', date: '2023-11-14T22:13:20.000Z', subject: 'Add rules', file: 'src/CLAUDE.md', added: 0, removed: 0 },
    ])
  })
  it('returns [] for empty output', () => {
    expect(parseLog('')).toEqual([])
  })
})

describe('recentMemoryChanges', () => {
  it('lists commits that touched CLAUDE.md files, newest first, ignoring other files', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'one\ntwo\n')
    await writeFile(join(dir, 'other.txt'), 'x')
    git('add', '.')
    git('commit', '-q', '-m', 'first memory')
    await writeFile(join(dir, 'other.txt'), 'y')
    git('commit', '-qam', 'unrelated')
    await mkdir(join(dir, 'src'))
    await writeFile(join(dir, 'src', 'CLAUDE.md'), 'nested\n')
    await writeFile(join(dir, 'CLAUDE.md'), 'one\nthree\nfour\n')
    git('add', '.')
    git('commit', '-q', '-m', 'update memory')

    const changes = await recentMemoryChanges(dir)
    expect(changes.map((c) => [c.subject, c.file, c.added, c.removed]).sort()).toEqual(
      [
        ['first memory', 'CLAUDE.md', 2, 0],
        ['update memory', 'CLAUDE.md', 2, 1],
        ['update memory', 'src/CLAUDE.md', 1, 0],
      ].sort(),
    )
    expect(changes.some((c) => c.subject === 'unrelated')).toBe(false)
  })

  it('respects the limit and fails soft outside a git repo', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'a\n')
    git('add', '.')
    git('commit', '-q', '-m', 'm')
    expect(await recentMemoryChanges(dir, { limit: 0 })).toEqual([])
    const plain = await mkdtemp(join(tmpdir(), 'hangar-plain-'))
    try {
      expect(await recentMemoryChanges(plain)).toEqual([])
      expect(await currentBranch(plain)).toBeUndefined()
    } finally {
      await rm(plain, { recursive: true, force: true })
    }
  })

  it('reports the current branch', async () => {
    await writeFile(join(dir, 'a'), 'a')
    git('add', '.')
    git('commit', '-q', '-m', 'init')
    expect(await currentBranch(dir)).toBe('main')
  })
})

import { recentCommits } from '../src/sources/gitHistory.js'

describe('recentCommits', () => {
  it('lists recent commit subjects newest first and fails soft outside a repo', async () => {
    await writeFile(join(dir, 'a'), '1')
    git('add', '.')
    git('commit', '-q', '-m', 'first')
    await writeFile(join(dir, 'a'), '2')
    git('commit', '-qam', 'second')
    expect((await recentCommits(dir)).map((c) => c.subject)).toEqual(['second', 'first'])
    expect(await recentCommits(dir, { limit: 1 })).toHaveLength(1)
    const plain = await mkdtemp(join(tmpdir(), 'hangar-plain-'))
    try {
      expect(await recentCommits(plain)).toEqual([])
    } finally {
      await rm(plain, { recursive: true, force: true })
    }
  })
})
