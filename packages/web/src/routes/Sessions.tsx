import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { LiveState, SessionListItem } from '@hangar/shared'
import { api } from '../api'
import { COLUMNS, groupByColumn } from '../board'
import { formatCost, formatDuration, shortModel } from '../format'
import { notifyEnabled, setNotify, useLive } from '../live'
import { timeAgo } from '../time'
import { HooksSetup } from './HooksSetup'

const chip = 'min-h-10 rounded-full border px-3.5 text-[13px] font-semibold cursor-pointer'
const chipOn = `${chip} border-accent bg-[#1e2738] text-text`
const chipOff = `${chip} border-border bg-transparent text-muted hover:text-text`

export function SessionsPage() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['sessions', q],
    queryFn: () => api.sessions(q),
    refetchInterval: 15_000, // live changes also invalidate this via SSE
    placeholderData: (prev) => prev,
  })
  const live = useLive()
  const [repo, setRepo] = useState<string>('all')

  if (isPending) return <p className="text-sm text-muted">Loading sessions…</p>
  if (isError) return <p className="text-sm text-error">Couldn't load sessions: {error.message}</p>

  const repos = [...new Set(data.map((s) => s.repoName))].sort()
  const shown = repo === 'all' ? data : data.filter((s) => s.repoName === repo)
  const groups = groupByColumn(shown, live)
  const needYou = groups.waiting.length
  const activeIn = (r: string) => data.filter((s) => s.repoName === r && ['waiting', 'running', 'idle'].includes(live.get(s.id)?.status ?? '')).length

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold">All sessions</h1>
          <span className="text-sm text-muted">
            Every Claude Code session on this machine, live.{' '}
            {needYou > 0 ? <span className="font-semibold text-waiting">{needYou} need{needYou === 1 ? 's' : ''} you.</span> : 'Nothing is waiting for you.'}
          </span>
        </div>
        <NotifyToggle />
      </div>

      <HooksSetup />

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search prompts, replies, files, branches…"
        aria-label="Search sessions"
        className="min-h-11 max-w-xl rounded-[10px] border border-border bg-surface px-3.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {data.length === 0 ? (
        <p className="text-sm text-muted">{q ? `No sessions match "${q}".` : 'No sessions found under ~/.claude/projects yet.'}</p>
      ) : (
        <>
          <div role="group" aria-label="Filter by repo" className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={repo === 'all'} className={repo === 'all' ? chipOn : chipOff} onClick={() => setRepo('all')}>
              All repos · {data.length}
            </button>
            {repos.map((r) => (
              <button key={r} type="button" aria-pressed={repo === r} className={repo === r ? chipOn : chipOff} onClick={() => setRepo(r)}>
                {r} · {activeIn(r)} active
              </button>
            ))}
          </div>

          {q ? (
            <Grid>
              {shown.map((s) => (
                <SessionCard key={s.id} s={s} live={live.get(s.id)} />
              ))}
            </Grid>
          ) : (
            <>
              <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                {COLUMNS.map((c) => (
                  <section key={c.id} className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface-2 p-3">
                    <h2 className="m-0 mx-1 mt-1 flex items-center gap-2 text-sm font-bold">
                      <span className={`size-2.5 rounded-full ${c.dot}`} />
                      {c.label}
                      <span className="ml-auto text-xs font-semibold text-muted">{groups[c.id].length}</span>
                    </h2>
                    {groups[c.id].length === 0 && <p className="m-1 text-xs text-muted">None</p>}
                    {groups[c.id].map((s) => (
                      <SessionCard key={s.id} s={s} live={live.get(s.id)} />
                    ))}
                  </section>
                ))}
              </div>
              {groups.earlier.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="m-0 text-[17px] font-bold">Earlier</h2>
                  <Grid>
                    {groups.earlier.map((s) => (
                      <SessionCard key={s.id} s={s} live={live.get(s.id)} />
                    ))}
                  </Grid>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">{children}</div>
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3.5 text-sm font-semibold text-text"
    >
      <span className={`relative h-5 w-9 rounded-full ${on ? 'bg-accent' : 'bg-[#4b5260]'}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-bg ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}

function NotifyToggle() {
  const qc = useQueryClient()
  const { data: prefs } = useQuery({ queryKey: ['prefs'], queryFn: api.prefs })
  const setDesktop = useMutation({
    mutationFn: (on: boolean) => api.setPrefs({ desktopAlerts: on }),
    onSuccess: (p) => qc.setQueryData(['prefs'], p),
  })
  return (
    <div className="flex flex-col items-end gap-2">
      <Toggle on={prefs?.desktopAlerts ?? false} onClick={() => setDesktop.mutate(!prefs?.desktopAlerts)} label="Desktop alert when a session needs me" />
      <BrowserToggle />
    </div>
  )
}

function BrowserToggle() {
  const [on, setOn] = useState(notifyEnabled)
  const [blocked, setBlocked] = useState(false)
  const toggle = async () => {
    const next = await setNotify(!on)
    setOn(next)
    setBlocked(!on && !next)
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Toggle on={on} onClick={toggle} label="Browser alert while this tab is open" />
      {blocked && <span className="text-xs text-waiting">The browser blocked notifications. Allow them for this site, then try again.</span>}
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

function SessionCard({ s, live }: { s: SessionListItem; live: LiveState | undefined }) {
  const waiting = live?.status === 'waiting'
  const now = live && live.status !== 'finished' ? live.detail : undefined
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: s.id }}
      className={`flex flex-col gap-2 rounded-[10px] border p-3.5 text-text no-underline hover:border-accent ${waiting ? 'border-waiting bg-[#2a2210]' : 'border-border bg-surface'}`}
    >
      <span className="flex justify-between gap-2 text-xs text-muted">
        <span className="font-semibold text-[#c9ced7]">{s.repoName}</span>
        {s.gitBranch && <span className="truncate font-mono">{s.gitBranch}</span>}
      </span>
      <span className="text-[15px] font-semibold leading-snug">{s.title}</span>
      {now && <span className={`break-words font-mono text-xs leading-snug ${waiting ? 'text-[#fde68a]' : 'text-muted'}`}>{waiting ? 'Wants: ' : ''}{now}</span>}
      <ContextBar s={s} />
      <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span>{shortModel(s.model)}</span>
        {live && live.status !== 'finished' ? <span>{live.status === 'waiting' ? 'waiting' : live.status} {timeAgo(new Date(live.since).toISOString()).replace(' ago', '')}</span> : s.lastEventAt && <span>{timeAgo(s.lastEventAt)}</span>}
        <span>{formatDuration(s.startedAt, s.lastEventAt)}</span>
        <span>{formatCost(s.costUSD)}</span>
        {s.compactions > 0 && <span className="text-done">{s.compactions} compaction{s.compactions > 1 ? 's' : ''}</span>}
      </span>
    </Link>
  )
}
