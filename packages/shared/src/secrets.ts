/**
 * Secrets scan: finds credentials sitting in text files Claude Code reads
 * (settings, .mcp.json, CLAUDE.md). Reports WHERE and WHAT KIND, never the
 * value. Heuristic: it will miss unusual formats and may flag test values.
 */

export type SecretKind = 'Anthropic key' | 'OpenAI-style key' | 'GitHub token' | 'AWS access key' | 'Slack token' | 'Google API key' | 'JWT' | 'Private key' | 'Bearer token' | 'Password or token assignment'

const KNOWN: [SecretKind, RegExp][] = [
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-style key', /sk-[A-Za-z0-9]{32,}/],
  ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Slack token', /xox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Bearer token', /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/],
]

// KEY=value, KEY: value, "key": "value" where the key names a secret and the value is a real literal.
const ASSIGN = /["']?([A-Za-z0-9_.-]*(?:token|secret|passw(?:or)?d|api[-_]?key|private[-_]?key|credential)[A-Za-z0-9_.-]*)["']?\s*[=:]\s*["']?([^\s"',}]{8,})/i
const PLACEHOLDER = /^(?:\$\{?[A-Za-z_]|<|\{\{|%[A-Za-z_]|your[-_]|xxx|\*{3}|•|changeme|example|placeholder|redacted|\.\.\.)/i

export interface SecretHit {
  /** 1-based line. */
  line: number
  kind: SecretKind
}

export function scanSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.length > 5000) continue // minified blob, not a config line
    let kind: SecretKind | undefined = KNOWN.find(([, re]) => re.test(line))?.[0]
    if (!kind) {
      const m = ASSIGN.exec(line)
      if (m && !PLACEHOLDER.test(m[2]!) && !/^(true|false|null|undefined)$/i.test(m[2]!)) kind = 'Password or token assignment'
    }
    if (kind) hits.push({ line: i + 1, kind })
  }
  return hits
}

export interface SecretFinding extends SecretHit {
  /** Display label of the file. */
  file: string
  /** Files meant to be committed (not *.local.* / CLAUDE.local.md) are riskier. */
  shared: boolean
}

export interface SecretsResponse {
  findings: SecretFinding[]
  filesChecked: number
}
