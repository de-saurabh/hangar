import { describe, expect, it } from 'vitest'
import { isValidRule, ruleCandidate } from '../src/index'

const bash = (command: string) => ruleCandidate('Bash', { command })

describe('ruleCandidate', () => {
  it('suggests a prefix rule: two words for subcommand tools, one otherwise', () => {
    expect(bash('npm test -- orders')).toEqual({ rule: 'Bash(npm test:*)', risky: false })
    expect(bash('pnpm vitest run')).toEqual({ rule: 'Bash(pnpm vitest:*)', risky: false })
    expect(bash('ls -la src')).toEqual({ rule: 'Bash(ls:*)', risky: false })
    expect(bash('git status')).toEqual({ rule: 'Bash(git status:*)', risky: false })
    expect(ruleCandidate('PowerShell', { command: 'Get-ChildItem src' })).toEqual({ rule: 'PowerShell(Get-ChildItem:*)', risky: false })
  })

  it('does not take a flag as the subcommand', () => {
    expect(bash('npm --version')).toEqual({ rule: 'Bash(npm:*)', risky: false })
  })

  it('ignores leading env assignments', () => {
    expect(bash('CI=1 npm test')).toEqual({ rule: 'Bash(npm test:*)', risky: false })
  })

  it('flags destructive and publishing commands as risky', () => {
    expect(bash('git push origin main')?.risky).toBe(true)
    expect(bash('rm -rf dist')?.risky).toBe(true)
    expect(bash('sudo apt install x')?.risky).toBe(true)
    expect(bash('npm publish')?.risky).toBe(true)
    expect(bash('curl https://example.com')?.risky).toBe(true)
    expect(bash('kubectl delete pod x')?.risky).toBe(true)
  })

  it('refuses compound or substituted commands, which a prefix rule cannot describe safely', () => {
    expect(bash('npm test && rm -rf /')).toBeUndefined()
    expect(bash('cat a | sh')).toBeUndefined()
    expect(bash('echo $(whoami)')).toBeUndefined()
    expect(bash('ls > out.txt')).toBeUndefined()
    expect(bash('a; b')).toBeUndefined()
  })

  it('refuses empty input, odd prefixes and unsupported tools', () => {
    expect(bash('')).toBeUndefined()
    expect(bash('   ')).toBeUndefined()
    expect(bash('"quoted thing" x')).toBeUndefined()
    expect(ruleCandidate('Edit', { file_path: 'a' })).toBeUndefined()
    expect(ruleCandidate('Bash', null)).toBeUndefined()
    expect(ruleCandidate(5, {})).toBeUndefined()
  })

  it('uses the tool name for MCP tools and marks writers risky', () => {
    expect(ruleCandidate('mcp__github__list_issues', {})).toEqual({ rule: 'mcp__github__list_issues', risky: false })
    expect(ruleCandidate('mcp__github__delete_branch', {})?.risky).toBe(true)
  })
})

describe('isValidRule', () => {
  it('accepts tool names and tool(pattern) rules only', () => {
    for (const ok of ['Bash(npm test:*)', 'mcp__a__b', 'Read', 'PowerShell(Get-ChildItem:*)']) expect(isValidRule(ok)).toBe(true)
    for (const bad of ['', 'Bash(', 'Bash()', 'Bash(a)(b)', 'Bash(a\nb)', '../x', 'Bash(' + 'x'.repeat(250) + ')']) expect(isValidRule(bad)).toBe(false)
  })
})
