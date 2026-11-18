import { describe, expect, it } from 'vitest'
import { lintMemory, type LintFile } from '../src/index'

const file = (text: string, over: Partial<LintFile> = {}): LintFile => ({ kind: 'project', label: 'CLAUDE.md', baseDir: '/r', text, ...over })
const lint = (files: LintFile[], existing: string[] = []) => lintMemory({ files, exists: (p) => existing.includes(p) })
const rules = (f: ReturnType<typeof lint>) => f.map((x) => x.rule)

describe('stale paths', () => {
  it('flags missing backticked paths and keeps existing ones quiet', () => {
    const f = lint([file('See `src/app.ts` and `src/old/gone.ts`.\nConfig is `package.json`.')], ['src/app.ts', 'package.json'])
    expect(f).toMatchObject([{ rule: 'stale-path', line: 1, message: expect.stringContaining('src/old/gone.ts') }])
  })

  it('ignores URLs, globs, flags, absolute paths, placeholders, code fences and product names', () => {
    const text = [
      '`https://example.com/a.json` `src/**/*.ts` `--config` `~/.claude/CLAUDE.md` `/etc/hosts` `<dir>/x.ts` `node.js` `$HOME/a.md`',
      '```',
      '`src/in-fence.ts`',
      '```',
      'Run `npm test` then `git status`.',
    ].join('\n')
    expect(lint([file(text)])).toEqual([])
  })

  it('checks directories ending in a slash and reports each path once', () => {
    const f = lint([file('`docs/` and `docs/`')])
    expect(f).toHaveLength(1)
  })
})

describe('imports', () => {
  it('flags @imports that do not exist, ignoring mentions, emails and home imports', () => {
    const f = lint([file('@docs/rules.md\n@~/me/prefs.md\nping @alice about it\nmail a@b.com\n`@docs/in-code.md`')])
    expect(f).toMatchObject([{ rule: 'broken-import', line: 1 }])
    expect(lint([file('@docs/rules.md')], ['docs/rules.md'])).toEqual([])
  })
})

describe('duplicates', () => {
  it('flags repeated instructions within and across files, ignoring short lines, headings and code', () => {
    const rule = '- Always run the full test suite before committing.'
    const f = lint([
      file(`# Rules\n${rule}\n- ok\n${rule.replace('- ', '* ').toUpperCase()}`, { label: 'a' }),
      file(`# Rules\n${rule}\n- ok\n\`\`\`\n${rule}\n\`\`\``, { label: 'b', kind: 'nested' }),
    ])
    const d = f.filter((x) => x.rule === 'duplicate')
    expect(d.map((x) => [x.file, x.line])).toEqual([['a', 4], ['b', 2]])
    expect(d[1]?.message).toContain('Already stated in a')
  })
})

describe('conflicts', () => {
  it('flags always vs never on the same subject, across files', () => {
    const f = lint([
      file('- Always use semicolons in TypeScript.', { kind: 'user', label: '~/.claude/CLAUDE.md' }),
      file("- Don't use semicolons in TypeScript.", { label: 'repo/CLAUDE.md' }),
    ])
    expect(f).toMatchObject([{ rule: 'conflict', file: 'repo/CLAUDE.md', line: 1 }])
    expect(f[0]?.suggestion).toContain('project file loads after')
  })

  it('does not flag agreeing or unrelated rules', () => {
    expect(rules(lint([file('- Never commit secrets to git.\n- Never commit secrets to git, ever.\n- Always run tests first.')]))).toEqual([])
  })
})

describe('size', () => {
  it('warns on a large always-loaded file but not on nested ones', () => {
    const big = 'x'.repeat(4 * 4100)
    expect(rules(lint([file(big)]))).toEqual(['size'])
    expect(lint([file(big, { kind: 'nested' })])).toEqual([])
  })

  it('suggests splitting a very long section', () => {
    const text = `# Intro\nshort\n## Database\n${'word '.repeat(1600 * 4 / 5 + 100)}\n## Other\nshort`
    const f = lint([file(text)])
    expect(f).toMatchObject([{ rule: 'section-size', line: 3, message: expect.stringContaining('Database') }])
  })
})

it('orders warnings before info, then by file and line', () => {
  const rule = '- Always run the full test suite before committing.'
  const f = lint([file(`${rule}\n${rule}\n\`missing/file.ts\``)])
  expect(f.map((x) => x.rule)).toEqual(['stale-path', 'duplicate'])
})
