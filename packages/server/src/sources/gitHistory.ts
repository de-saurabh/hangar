import { execFile } from 'node:child_process'

export interface MemoryChange {
  commit: string
  /** ISO timestamp of the commit. */
  date: string
  subject: string
  /** Path relative to the repo root. */
  file: string
  added: number
  removed: number
}

const PATHSPECS = ['CLAUDE.md', 'CLAUDE.local.md', ':(glob)**/CLAUDE.md', ':(glob)**/CLAUDE.local.md']
const RS = '\x1e'

function git(repoPath: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    // execFile (no shell): the path and arguments are never interpreted by a shell.
    execFile('git', ['-C', repoPath, ...args], { timeout: 5000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      resolve(err ? '' : stdout)
    })
  })
}

/** Parse `git log --numstat` output produced by recentMemoryChanges. Exported for tests. */
export function parseLog(out: string): MemoryChange[] {
  const changes: MemoryChange[] = []
  for (const record of out.split(RS)) {
    const lines = record.split('\n').filter((l) => l.trim() !== '')
    const head = lines.shift()?.split('\t')
    if (!head || head.length < 3) continue
    const [commit, ct, ...rest] = head
    const date = new Date(Number(ct) * 1000)
    if (!commit || Number.isNaN(date.getTime())) continue
    for (const l of lines) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(l)
      if (!m) continue
      changes.push({
        commit: commit.slice(0, 7),
        date: date.toISOString(),
        subject: rest.join('\t').slice(0, 120),
        file: (m[3] ?? '').replace(/\\/g, '/'),
        added: m[1] === '-' ? 0 : Number(m[1]),
        removed: m[2] === '-' ? 0 : Number(m[2]),
      })
    }
  }
  return changes
}

/**
 * Recent commits touching CLAUDE.md / CLAUDE.local.md files, newest first.
 * Returns [] for anything that is not a readable git repo (fails soft).
 */
export async function recentMemoryChanges(repoPath: string, opts: { sinceDays?: number; limit?: number } = {}): Promise<MemoryChange[]> {
  const out = await git(repoPath, [
    'log',
    `--since=${opts.sinceDays ?? 30}.days`,
    '-n',
    '50',
    `--pretty=format:${RS}%H%x09%ct%x09%s`,
    '--numstat',
    '--',
    ...PATHSPECS,
  ])
  return parseLog(out).slice(0, opts.limit ?? 10)
}

/** Current branch name, or undefined (detached HEAD / not a repo). */
export async function currentBranch(repoPath: string): Promise<string | undefined> {
  const out = (await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  return out && out !== 'HEAD' ? out : undefined
}

export interface Commit {
  commit: string
  date: string
  subject: string
}

/**
 * Recent non-merge commit subjects on the current branch, newest first.
 * Fails soft to [] outside a git repo.
 */
export async function recentCommits(repoPath: string, opts: { sinceDays?: number; limit?: number } = {}): Promise<Commit[]> {
  const out = await git(repoPath, ['log', `--since=${opts.sinceDays ?? 7}.days`, '--no-merges', '-n', String(opts.limit ?? 30), `--pretty=format:%H%x09%ct%x09%s`])
  const commits: Commit[] = []
  for (const l of out.split('\n')) {
    const [hash, ct, ...rest] = l.split('\t')
    const d = new Date(Number(ct) * 1000)
    if (!hash || Number.isNaN(d.getTime())) continue
    commits.push({ commit: hash.slice(0, 7), date: d.toISOString(), subject: rest.join('\t').slice(0, 120) })
  }
  return commits
}
