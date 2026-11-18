import { describe, expect, it } from 'vitest'
import { scanSecrets } from '../src/index'

describe('scanSecrets', () => {
  it('finds known token formats and reports only line and kind', () => {
    const text = ['ok', `key: sk-ant-${'a'.repeat(30)}`, `gh: ghp_${'b'.repeat(36)}`, 'AKIAABCDEFGHIJKLMNOP', '-----BEGIN RSA PRIVATE KEY-----'].join('\n')
    const hits = scanSecrets(text)
    expect(hits).toEqual([
      { line: 2, kind: 'Anthropic key' },
      { line: 3, kind: 'GitHub token' },
      { line: 4, kind: 'AWS access key' },
      { line: 5, kind: 'Private key' },
    ])
    expect(JSON.stringify(hits)).not.toContain('aaaaaaaa')
  })

  it('flags secret-named assignments with real-looking values', () => {
    expect(scanSecrets('"MY_API_KEY": "9f8e7d6c5b4a"')).toEqual([{ line: 1, kind: 'Password or token assignment' }])
    expect(scanSecrets('DB_PASSWORD=hunter2hunter2')).toHaveLength(1)
    expect(scanSecrets('password: s3cr3tvalue!')).toHaveLength(1)
  })

  it('ignores placeholders, references and booleans', () => {
    const text = ['API_KEY=${API_KEY}', 'token: <your token>', '"password": "changeme-please"', 'secret=true', 'api_key: $OPENAI_API_KEY', 'token = ...']
    expect(scanSecrets(text.join('\n'))).toEqual([])
  })

  it('ignores prose that merely mentions secrets, and huge lines', () => {
    expect(scanSecrets('Never commit a token or password to git.')).toEqual([])
    expect(scanSecrets('x'.repeat(6000) + 'token=abcdefgh1234')).toEqual([])
  })
})
