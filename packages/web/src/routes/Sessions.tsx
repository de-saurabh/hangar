import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { SessionListItem } from '@hangar/shared'
import { api } from '../api'
import { formatCost, formatDuration, shortModel } from '../format'
import { timeAgo } from '../time'

const chip = 'min-h-10 rounded-full border px-3.5 text-[13px] font-semibold cursor-pointer'
const chipOn = `${chip} border-accent bg-[#1e2738] text-text`
const chipOff = `${chip} border-border bg-transparent text-muted hover:text-text`

export function SessionsPage() {
  // Polling until live updates (SSE) arrive in M3.
  const { data, isPending, isError, error } = useQuery({ queryKey: ['sessions'], queryFn: api.sessions, refetchInterval: 5000 })
  const [repo, setRepo] = useState<string>('all')

  if (isPending) return <p className="text-sm text-muted">Loading sessions…</p>
  if (isError) return <p className="text-sm text-error">Couldn't load sessions: {error.message}</p>

  const repos = [...new Set(data.map((s) => s.repoName))].sort()
  const shown = repo === 'all' ? data : data.filter((s) => s.repoName === repo)

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-bold">All sessions</h1>
        <span className="text-sm text-muted">
          Every Claude Code session on this machine, newest first. {data.length} found.
        </span>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-muted">No sessions found under ~/.claude/projects yet.</p>
      ) : (
        <>
          <div role="group" aria-label="Filter by repo" className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={repo === 'all'} className={repo === 'all' ? chipOn : chipOff} onClick={() => setRepo('all')}>
              All repos · {data.length}
            </button>
            {repos.map((r) => (
              <button key={r} type="button" aria-pressed={repo === r} className={repo === r ? chipOn : chipOff} onClick={() => setRepo(r)}>
                {r} · {data.filter((s) => s.repoName === r).length}
              </button>
            ))}
          </div>
          <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {shown.map((s) => (
              <SessionCard key={s.id} s={s} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function ContextBar({ s }: { s: Pick<SessionListItem, 'contextTokens' | 'contextWindow'> }) {
  if (s.contextTokens === undefined || !s.contextWindow) return null
  const pct = Math.min(100, Math.round((s.contextTokens / s.contextWindow) * 100))
  return (
    <span className="flex items-center gap-2">
      <span className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-border">
        <span className={`block h-full ${pct > 80 ? 'bg-error' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-[66px] text-right text-[11px] text-muted" title="Estimate: window size is inferred from the transcript">
        ctx ~{pct}%
      </span>
    </span>
  )
}

function SessionCard({ s }: { s: SessionListItem }) {
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: s.id }}
      className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-3.5 text-text no-underline hover:border-accent"
    >
      <span className="flex justify-between gap-2 text-xs text-muted">
        <span className="font-semibold text-[#c9ced7]">{s.repoName}</span>
        {s.gitBranch && <span className="truncate font-mono">{s.gitBranch}</span>}
      </span>
      <span className="text-[15px] font-semibold leading-snug">{s.title}</span>
      <ContextBar s={s} />
      <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span>{shortModel(s.model)}</span>
        {s.lastEventAt && <span>{timeAgo(s.lastEventAt)}</span>}
        <span>{formatDuration(s.startedAt, s.lastEventAt)}</span>
        <span>{formatCost(s.costUSD)}</span>
        {s.compactions > 0 && <span className="text-done">{s.compactions} compaction{s.compactions > 1 ? 's' : ''}</span>}
      </span>
    </Link>
  )
}
