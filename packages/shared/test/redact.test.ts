import { describe, expect, it } from 'vitest'
import { isSensitiveSetting, MASK, redactText } from '../src/index'

// Fake, format-matching tokens built at runtime so no real-looking secret sits in the repo.
const fake = {
  anthropic: 'sk-ant-' + 'a1'.repeat(15),
  github: 'ghp_' + 'Ab1'.repeat(12),
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  jwt: ['eyJ' + 'a'.repeat(12), 'b'.repeat(12), 'c'.repeat(12)].join('.'),
}

describe('isSensitiveSetting', () => {
  it('masks env.* keys named like secrets, case-insensitively, by last segment', () => {
    for (const k of ['env.API_KEY', 'env.GITHUB_TOKEN', 'env.db_password', 'env.MY_SECRET', 'env.AWS_CREDENTIALS', 'env.Authorization']) {
      expect(isSensitiveSetting(k, 'hunter2')).toBe(true)
    }
  })

  it('does not mask ordinary env vars or non-env config keys by name', () => {
    expect(isSensitiveSetting('env.NODE_ENV', 'development')).toBe(false)
    expect(isSensitiveSetting('apiKeyHelper', '/usr/local/bin/get-key')).toBe(false)
    expect(isSensitiveSetting('model', 'opus')).toBe(false)
    expect(isSensitiveSetting('env.API_KEY', '')).toBe(false)
  })

  it('masks any key whose value looks like a known token format', () => {
    for (const v of Object.values(fake)) expect(isSensitiveSetting('env.WHATEVER', v)).toBe(true)
    expect(isSensitiveSetting('someOtherKey', fake.github)).toBe(true)
    expect(isSensitiveSetting('list', ['ok', fake.anthropic])).toBe(true)
  })

  it('leaves non-strings and ordinary values alone', () => {
    expect(isSensitiveSetting('cleanupPeriodDays', 30)).toBe(false)
    expect(isSensitiveSetting('flag', true)).toBe(false)
    expect(isSensitiveSetting('env.PATHISH', 'C:\\Program Files\\x')).toBe(false)
  })
})

describe('redactText', () => {
  it('replaces known token formats and bearer tokens inside commands', () => {
    const out = redactText(`curl -H "Authorization: Bearer ${'x'.repeat(24)}" -d ${fake.github} http://h`)
    expect(out).not.toContain('x'.repeat(24))
    expect(out).not.toContain(fake.github)
    expect(out).toContain(MASK)
    expect(out).toContain('curl')
    expect(out).toContain('http://h')
  })

  it('redacts KEY=value and --flag value assignments for secret-looking names', () => {
    expect(redactText('API_TOKEN=abcdef123456 run.sh')).toBe(`API_TOKEN=${MASK} run.sh`)
    expect(redactText('tool --password hunter22 --verbose')).toBe(`tool --password ${MASK} --verbose`)
    expect(redactText('export DB_SECRET="s3cr3t-value"')).toBe(`export DB_SECRET="${MASK}"`)
  })

  it('leaves harmless text untouched', () => {
    const text = 'npx prettier --write $FILE && ./scripts/block-prod-db.sh'
    expect(redactText(text)).toBe(text)
  })
})
