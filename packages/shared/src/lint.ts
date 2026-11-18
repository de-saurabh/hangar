import { estimateTokens, LARGE_MEMORY_TOKENS, type MemoryKind } from './memory'

/**
 * CLAUDE.md linter. Pure and deliberately conservative: every rule is a
 * heuristic, so findings say "may" and a quiet file beats a noisy one.
 */

export type LintRule = 'stale-path' | 'broken-import' | 'duplicate' | 'conflict' | 'size' | 'section-size'
export type LintSeverity = 'warning' | 'info'

export interface LintFinding {
  rule: LintRule
  severity: LintSeverity
  /** Display label of the file the finding is about. */
  file: string
  /** 1-based line, when the finding points at one. */
  line?: number
  message: string
  suggestion?: string
}

export interface LintFile {
  kind: MemoryKind
  label: string
  /** Directory that relative paths in this file resolve against (the repo root, or a nested file's folder for @imports). */
  baseDir: string
  text: string
}

export interface LintInput {
  files: LintFile[]
  /** True if the path exists. Supplied by the server so this module stays pure. */
  exists: (absOrRelPath: string, baseDir: string) => boolean
}

interface Line {
  n: number
  text: string
  /** Inside a fenced code block. */
  code: boolean
}

function toLines(text: string): Line[] {
  let fence: string | undefined
  return text.split(/\r?\n/).map((raw, i) => {
    const m = /^\s*(```+|~~~+)/.exec(raw)
    if (m) {
      const mark = m[1]!.slice(0, 3)
      if (fence === undefined) fence = mark
      else if (fence === mark) fence = undefined
      return { n: i + 1, text: raw, code: true }
    }
    return { n: i + 1, text: raw, code: fence !== undefined }
  })
}

const KNOWN_EXT = /\.(?:[cm]?[jt]sx?|json5?|md|mdx|ya?ml|toml|py|rb|go|rs|java|kt|cs|php|css|scss|html|sql|sh|ps1|lock|env|txt|prisma|graphql)$/i

/** Backticked tokens that look like a relative file path worth checking. */
function pathCandidates(line: string): string[] {
  const out: string[] = []
  for (const m of line.matchAll(/`([^`\s]+)`/g)) {
    const t = m[1]!.replace(/[.,;:]+$/, '')
    if (/^[a-z]+:\/\//i.test(t) || t.startsWith('~') || t.startsWith('/') || /^[A-Za-z]:[\\/]/.test(t)) continue // URLs, home, absolute
    if (/[*?<>{}$|()[\]=]/.test(t)) continue // globs, placeholders, expressions, flags
    if (t.startsWith('-') || t.includes('@')) continue
    if (/^\.{1,2}$/.test(t) || /^\.[\w-]+\/$/.test(t)) continue // ".", ".." and bare dot-dirs like .claude/ are generic references
    const hasDir = t.includes('/')
    if (!(hasDir && (KNOWN_EXT.test(t) || t.endsWith('/'))) && !(!hasDir && KNOWN_EXT.test(t) && /^[\w.-]+$/.test(t) && /\.(?:json|md|ya?ml|toml|lock|env)$/i.test(t))) continue
    // A bare "node.js" / "next.config" style name is a product, not a file: require a real stem.
    if (/^(?:node|vue|next|nuxt|express|socket|three|chart)\.(?:js|ts)$/i.test(t)) continue
    out.push(t)
  }
  return out
}

function stalePaths(f: LintFile, lines: Line[], exists: LintInput['exists']): LintFinding[] {
  const out: LintFinding[] = []
  const seen = new Set<string>()
  for (const l of lines) {
    if (l.code) continue
    for (const p of pathCandidates(l.text)) {
      if (seen.has(p)) continue
      seen.add(p)
      if (!exists(p, f.baseDir)) {
        out.push({ rule: 'stale-path', severity: 'warning', file: f.label, line: l.n, message: `\`${p}\` doesn't exist in this repo.`, suggestion: 'Update or remove the reference; Claude may go looking for it.' })
      }
    }
  }
  return out
}

function brokenImports(f: LintFile, lines: Line[], exists: LintInput['exists']): LintFinding[] {
  const out: LintFinding[] = []
  for (const l of lines) {
    if (l.code) continue
    // `@path/to/file` as its own word, outside inline code. Needs a slash or extension so "@mentions" and emails are ignored.
    const stripped = l.text.replace(/`[^`]*`/g, '')
    for (const m of stripped.matchAll(/(?:^|\s)@([^\s]+)/g)) {
      const p = m[1]!.replace(/[.,;:)]+$/, '')
      if (!(p.includes('/') || KNOWN_EXT.test(p)) || /^[a-z]+:\/\//i.test(p) || /[*?<>{}$]/.test(p)) continue
      const target = p.startsWith('~/') ? p : p
      if (target.startsWith('~/')) continue // user-home imports: not checked here
      if (!exists(target, f.baseDir)) {
        out.push({ rule: 'broken-import', severity: 'warning', file: f.label, line: l.n, message: `Import @${p} points at a file that doesn't exist.`, suggestion: 'Fix the path or remove the import.' })
      }
    }
  }
  return out
}

/** Lower-cased, punctuation-light form used to compare instructions. */
function norm(s: string): string {
  return s
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!\s]+$/, '')
    .trim()
    .toLowerCase()
}

const MIN_DUP_CHARS = 24

function duplicates(files: { f: LintFile; lines: Line[] }[]): LintFinding[] {
  const seen = new Map<string, { file: string; line: number }>()
  const out: LintFinding[] = []
  for (const { f, lines } of files) {
    for (const l of lines) {
      if (l.code || /^\s*#/.test(l.text)) continue
      const key = norm(l.text)
      if (key.length < MIN_DUP_CHARS) continue
      const first = seen.get(key)
      if (!first) {
        seen.set(key, { file: f.label, line: l.n })
        continue
      }
      const same = first.file === f.label
      out.push({
        rule: 'duplicate',
        severity: 'info',
        file: f.label,
        line: l.n,
        message: same ? `Repeats line ${first.line} of this file.` : `Already stated in ${first.file} (line ${first.line}).`,
        suggestion: 'Keep one copy; duplicated rules cost tokens every session.',
      })
    }
  }
  return out
}

type Polarity = 'do' | 'dont'

/** "always use tabs" -> { do, "use tabs" }; "never use tabs" / "don't use tabs" -> { dont, "use tabs" }. */
function directive(line: string): { polarity: Polarity; subject: string } | undefined {
  const s = norm(line)
  const m = /^(?:you (?:must|should) )?(always|never|do not|don't|dont|must not|should not|avoid|prefer to)\s+(.{6,})$/.exec(s)
  if (!m) return undefined
  const word = m[1]!
  const polarity: Polarity = word === 'always' || word === 'prefer to' ? 'do' : 'dont'
  return { polarity, subject: m[2]!.replace(/\b(?:the|a|an|any)\b\s*/g, '').replace(/\s+/g, ' ').trim() }
}

function conflicts(files: { f: LintFile; lines: Line[] }[]): LintFinding[] {
  const seen = new Map<string, { polarity: Polarity; file: string; kind: MemoryKind; line: number }>()
  const out: LintFinding[] = []
  for (const { f, lines } of files) {
    for (const l of lines) {
      if (l.code) continue
      const d = directive(l.text)
      if (!d) continue
      const first = seen.get(d.subject)
      if (!first) {
        seen.set(d.subject, { polarity: d.polarity, file: f.label, kind: f.kind, line: l.n })
        continue
      }
      if (first.polarity !== d.polarity) {
        const cross = first.file !== f.label
        out.push({
          rule: 'conflict',
          severity: 'warning',
          file: f.label,
          line: l.n,
          message: `May contradict ${cross ? first.file : 'line ' + first.line} (line ${first.line}): "${d.subject}" is both required and forbidden.`,
          suggestion: cross && first.kind === 'user' ? 'The project file loads after your global one; make sure it says what you mean.' : 'Decide which applies and remove the other.',
        })
      }
    }
  }
  return out
}

function sizes(files: { f: LintFile; lines: Line[] }[]): LintFinding[] {
  const out: LintFinding[] = []
  for (const { f, lines } of files) {
    const tokens = estimateTokens(f.text)
    if (f.kind !== 'nested' && tokens > LARGE_MEMORY_TOKENS) {
      out.push({
        rule: 'size',
        severity: 'warning',
        file: f.label,
        message: `~${(tokens / 1000).toFixed(1)}k tokens, loaded in every session.`,
        suggestion: 'Move area-specific rules into a nested CLAUDE.md in that folder; Claude loads those only when it works there.',
      })
    }
    // Sections: split on top-level and second-level headings, outside code fences.
    const sections: { title: string; line: number; text: string[] }[] = []
    for (const l of lines) {
      const h = !l.code && /^#{1,2}\s+(.+?)\s*#*$/.exec(l.text)
      if (h) sections.push({ title: h[1]!, line: l.n, text: [] })
      else sections.at(-1)?.text.push(l.text)
    }
    for (const s of sections) {
      const t = estimateTokens(s.text.join('\n'))
      if (f.kind !== 'nested' && t > 1500) {
        out.push({ rule: 'section-size', severity: 'info', file: f.label, line: s.line, message: `Section "${s.title}" is ~${(t / 1000).toFixed(1)}k tokens.`, suggestion: 'A long section is a good candidate for a nested CLAUDE.md or a skill.' })
      }
    }
  }
  return out
}

const SEVERITY = { warning: 0, info: 1 } as const

export function lintMemory(input: LintInput): LintFinding[] {
  const parsed = input.files.map((f) => ({ f, lines: toLines(f.text) }))
  const findings = [
    ...parsed.flatMap(({ f, lines }) => [...stalePaths(f, lines, input.exists), ...brokenImports(f, lines, input.exists)]),
    ...conflicts(parsed),
    ...duplicates(parsed),
    ...sizes(parsed),
  ]
  return findings.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0))
}
