import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isInside, ruleCandidate, type HookPayload, type Repo, type RuleCandidate, type Suggestion } from '@hangar/shared'
import { hangarHome } from './config.js'

interface Counter {
  rule: string
  risky: boolean
  total: number
  /** Approvals per working directory. */
  byCwd: Record<string, number>
  lastAt: string
}

interface Pending {
  tool: string
  toolUseId?: string
  candidate: RuleCandidate
  cwd?: string
}

const MIN_APPROVALS = 3
const MAX_RULES = 500
const SINGLE_REPO_SHARE = 0.8

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

/**
 * Counts tool calls that needed a manual approval. A `PermissionRequest`
 * hook marks a prompt; the same call finishing (`PostToolUse`) means it was
 * approved. Denied or abandoned prompts are never counted. Only the derived
 * rule string and the working directory are kept; never prompts or output.
 *
 * Verified with real Claude Code 2.1.327: PermissionRequest fires after
 * PreToolUse (without a tool_use_id), and a denied call gets no PostToolUse.
 * An interactive approval itself has not been observed (see DATA-SOURCES.md).
 */
export class ApprovalTracker {
  private pending = new Map<string, Pending>()
  private counters?: Map<string, Counter>
  private saveTimer?: NodeJS.Timeout
  private loading?: Promise<void>

  constructor(
    private readonly file: () => string = () => join(hangarHome(), 'approvals.json'),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private load(): Promise<void> {
    this.loading ??= (async () => {
      this.counters = new Map()
      try {
        const raw = JSON.parse(await readFile(this.file(), 'utf8')) as { rules?: Counter[] }
        for (const c of raw.rules ?? []) {
          if (typeof c?.rule === 'string' && typeof c.total === 'number') this.counters.set(c.rule, { rule: c.rule, risky: c.risky === true, total: c.total, byCwd: c.byCwd ?? {}, lastAt: c.lastAt ?? '' })
        }
      } catch {
        // no file yet or unreadable: start empty (the next save replaces it)
      }
    })()
    return this.loading
  }

  async ingest(p: HookPayload): Promise<void> {
    const session = str(p.session_id)
    const event = str(p.hook_event_name)
    if (!session || !event) return

    if (event === 'PermissionRequest') {
      const candidate = ruleCandidate(p.tool_name, p.tool_input)
      if (!candidate) {
        this.pending.delete(session)
        return
      }
      const cwd = str(p.cwd)
      const id = str(p.tool_use_id)
      this.pending.set(session, { tool: String(p.tool_name), candidate, ...(cwd ? { cwd } : {}), ...(id ? { toolUseId: id } : {}) })
      return
    }
    if (event === 'PostToolUse') {
      const pend = this.pending.get(session)
      if (!pend) return
      const id = str(p.tool_use_id)
      if (pend.tool !== p.tool_name || (pend.toolUseId && id && pend.toolUseId !== id)) return
      this.pending.delete(session)
      await this.record(pend)
      return
    }
    if (event === 'UserPromptSubmit' || event === 'Stop' || event === 'SessionEnd' || event === 'PermissionDenied') this.pending.delete(session)
  }

  private async record(p: Pending): Promise<void> {
    await this.load()
    const counters = this.counters!
    const c = counters.get(p.candidate.rule) ?? { rule: p.candidate.rule, risky: p.candidate.risky, total: 0, byCwd: {}, lastAt: '' }
    c.total++
    if (p.cwd) c.byCwd[p.cwd] = (c.byCwd[p.cwd] ?? 0) + 1
    c.lastAt = this.now().toISOString()
    counters.set(c.rule, c)
    if (counters.size > MAX_RULES) {
      const least = [...counters.values()].sort((a, b) => a.total - b.total)[0]
      if (least) counters.delete(least.rule)
    }
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      void this.flush()
    }, 1000)
    this.saveTimer.unref()
  }

  /** Write counters now (atomic). Called on a debounce, and by tests. */
  async flush(): Promise<void> {
    if (!this.counters) return
    const file = this.file()
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify({ version: 1, rules: [...this.counters.values()] }, null, 2) + '\n', 'utf8')
    await rename(tmp, file)
  }

  /** Rules approved by hand at least 3 times, most approved first, minus those already allowed. */
  async suggestions(repos: Repo[], alreadyAllowed: (rule: string, repo?: Repo) => boolean): Promise<Suggestion[]> {
    await this.load()
    const out: Suggestion[] = []
    for (const c of this.counters!.values()) {
      if (c.total < MIN_APPROVALS) continue
      // Attribute each approval to a registered repo, else to its folder name.
      const perRepo = new Map<string, { repo?: Repo; n: number }>()
      for (const [cwd, n] of Object.entries(c.byCwd)) {
        const repo = repos.filter((r) => isInside(cwd, r.path)).sort((a, b) => b.path.length - a.path.length)[0]
        const key = repo?.id ?? cwd
        const cur = perRepo.get(key) ?? { ...(repo ? { repo } : {}), n: 0 }
        cur.n += n
        perRepo.set(key, cur)
      }
      const ranked = [...perRepo.entries()].sort((a, b) => b[1].n - a[1].n)
      const top = ranked[0]?.[1]
      const single = top?.repo && top.n / c.total >= SINGLE_REPO_SHARE ? top.repo : undefined
      if (alreadyAllowed(c.rule, single)) continue
      out.push({
        rule: c.rule,
        risky: c.risky,
        approvals: c.total,
        repos: ranked.map(([key, v]) => v.repo?.name ?? key.split(/[\\/]/).filter(Boolean).pop() ?? key).slice(0, 4),
        scope: single ? { repoId: single.id, repoName: single.name } : 'global',
        lastAt: c.lastAt,
      })
    }
    return out.sort((a, b) => b.approvals - a.approvals)
  }
}
