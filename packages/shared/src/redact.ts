/** Helpers that keep secrets out of anything Hangar returns or logs. */

/**
 * Reduce a URL to origin + path: drops credentials (user:pass@), the query
 * string and the fragment, which is where tokens usually live. Falls back to
 * cutting at `?`/`#` if the URL doesn't parse.
 */
export function safeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return raw.replace(/^[^@/]*@/, '').split(/[?#]/)[0] ?? ''
  }
}

export const MASK = '••••••••'

// Well-known token formats. Deliberately specific to keep false positives low.
const TOKEN_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /sk-[A-Za-z0-9]{32,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/,
]

const SECRET_KEY = /(token|secret|passw(or)?d|api[-_]?key|credential|private[-_]?key|auth)/i

/**
 * Should the value stored at this settings key be hidden by default?
 * Only `env.*` is judged by name (those hold arbitrary user values); other
 * settings keys are config, not credentials. Any key is masked if its value
 * looks like a known token format.
 */
export function isSensitiveSetting(key: string, value: unknown): boolean {
  if (typeof value === 'string' && value === '') return false
  if (key.startsWith('env.') && typeof value === 'string' && SECRET_KEY.test(key.split('.').pop() ?? '')) return true
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  return TOKEN_PATTERNS.some((p) => p.test(text))
}

/** Replace anything that looks like a secret inside free text (e.g. a hook command). */
export function redactText(text: string): string {
  let out = text
  for (const p of TOKEN_PATTERNS) out = out.replace(new RegExp(p.source, 'g'), MASK)
  // KEY=value / --token value / "password": "value" style assignments
  out = out.replace(/\b([A-Za-z0-9_-]*(?:token|secret|passw(?:or)?d|api[-_]?key)[A-Za-z0-9_-]*)(\s*[=:]\s*|\s+)(["']?)([^\s"']{6,})\3/gi, (m, k, sep, q) => `${k}${sep}${q}${MASK}${q}`)
  return out
}

/** Truncate for display, adding an ellipsis. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
