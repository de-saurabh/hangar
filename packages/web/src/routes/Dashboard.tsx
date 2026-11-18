import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'
import type { Dashboard as DashboardData, DashboardSession } from '@hangar/shared'
import { api } from '../api'
import { formatCost, formatTokens, shortModel } from '../format'
import { timeAgo } from '../time'
import { ContextBar } from './Sessions'

const card = 'flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-4'
const pill = 'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold'
const PILL: Record<string, string> = {
  waiting: `${pill} bg-waiting text-on-waiting`,
  running: `${pill} bg-running text-on-running`,
  idle: `${pill} bg-border text-text`,
}
const LABEL: Record<string, string> = { waiting: 'Waiting for you', running: 'Running', idle: 'Idle' }

export function Dashboard() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.dashboard,
    refetchInterval: 15_000, // live changes also invalidate this via SSE
  })

  if (isPending) return <p className="text-sm text-muted">Loading…</p>
  if (isError) return <p className="text-sm text-error">Couldn't load the dashboard: {error.message}</p>

  return (
    <div className="flex flex-col gap-5">
      <Alerts data={data} />
      <Stats data={data} />
      <LiveSessions data={data} />
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[999_1_560px]">
          <Repos data={data} />
        </div>
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <Tasks data={data} />
          <MemoryChanges data={data} />
        </aside>
      </div>
    </div>
  )
}

function Alerts({ data }: { data: DashboardData }) {
  return (
    <>
      {data.alerts.map((a) => (
        <div key={a.sessionId} role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-waiting bg-warn-bg px-4 py-3.5">
          <span className="size-2.5 rounded-full bg-waiting" />
          <span className="flex-[1_1_360px] text-sm leading-normal">
            <strong className="text-warn-text">{a.repoName} is waiting for you.</strong>
            {a.detail && (
              <>
                {' '}
                It wants to run <code className="font-mono text-[13px] text-warn-text">{a.detail}</code>
              </>
            )}{' '}
            · waiting {timeAgo(new Date(a.since).toISOString()).replace(' ago', '')}
          </span>
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId: a.sessionId }}
            className="inline-flex min-h-10 items-center rounded-lg bg-waiting px-3.5 text-sm font-bold text-on-waiting no-underline"
          >
            Open session
          </Link>
          <CopyButton text={`claude --resume ${a.sessionId}`} label="Copy resume command" className="min-h-10 rounded-lg border border-warn-border bg-transparent px-3.5 text-sm font-semibold text-warn-text" />
        </div>
      ))}
    </>
  )
}

function CopyButton({ text, label, className }: { text: string; label: string; className: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={`cursor-pointer ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // clipboard blocked: nothing to do
        }
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

function Stats({ data }: { data: DashboardData }) {
  const s = data.stats
  const items = [
    { label: 'Active sessions', v: String(s.activeSessions), sub: s.waiting > 0 ? `${s.waiting} waiting for you` : 'none waiting' },
    { label: 'New tokens today', v: formatTokens(s.tokensToday), sub: `in ${s.sessionsToday} session${s.sessionsToday === 1 ? '' : 's'} active today`, tip: 'Input + output + cache writes, summed over sessions active today. Approximate.' },
    { label: 'Cost today', v: formatCost(s.costToday), sub: 'sessions active today', tip: 'As reported by Claude Code; sessions still running have no cost yet.' },
    { label: 'Open tasks', v: String(s.openTasks), sub: `${s.inProgressTasks} in progress` },
  ]
  return (
    <section aria-label="Today" className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
      {items.map((i) => (
        <div key={i.label} title={i.tip} className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
          <span className="text-[13px] text-muted">{i.label}</span>
          <span className="text-[28px] font-bold tabular-nums">{i.v}</span>
          <span className="text-xs text-muted">{i.sub}</span>
        </div>
      ))}
    </section>
  )
}

function LiveSessions({ data }: { data: DashboardData }) {
  return (
    <section className={`${card} gap-2.5 p-[18px]`}>
      <div className="flex items-baseline justify-between gap-2.5">
        <h2 className="m-0 text-[17px] font-bold">Live sessions</h2>
        <Link to="/sessions" className="text-[13px]">
          See all on the board →
        </Link>
      </div>
      {data.live.length === 0 && <p className="m-0 text-sm text-muted">No live sessions right now.</p>}
      {data.live.map((s) => (
        <LiveRow key={s.id} s={s} />
      ))}
    </section>
  )
}

function LiveRow({ s }: { s: DashboardSession }) {
  const status = s.live?.status ?? 'idle'
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: s.id }}
      className="flex flex-wrap items-center gap-x-[18px] gap-y-2.5 rounded-[10px] border border-border bg-surface-2 px-3.5 py-3 text-text no-underline hover:border-accent"
    >
      <span className={PILL[status] ?? PILL.idle}>{LABEL[status] ?? status}</span>
      <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
        <span className="text-[15px] font-semibold">
          {s.repoName} <span className="font-normal text-muted">· {s.title}</span>
        </span>
        {s.live?.detail && <span className="truncate font-mono text-xs text-muted">{s.live.detail}</span>}
      </span>
      <span className="w-[150px]">
        <ContextBar s={s} />
      </span>
      <span className="w-[120px] text-right text-xs text-muted">{shortModel(s.model)}</span>
    </Link>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2.5">
        <h2 className="m-0 text-[17px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Repos({ data }: { data: DashboardData }) {
  const qc = useQueryClient()
  const [path, setPath] = useState('')
  const [adding, setAdding] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['dashboard'] }).then(() => qc.invalidateQueries({ queryKey: ['repos'] }))
  const add = useMutation({
    mutationFn: api.addRepo,
    onSuccess: () => {
      setPath('')
      setAdding(false)
      return refresh()
    },
  })
  const remove = useMutation({ mutationFn: api.removeRepo, onSuccess: refresh })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (path.trim()) add.mutate(path.trim())
  }

  return (
    <Section
      title="Repos"
      action={
        <button type="button" onClick={() => setAdding(!adding)} className="min-h-9 cursor-pointer rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-text">
          + Add repo
        </button>
      }
    >
      {adding && (
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <label htmlFor="repo-path" className="sr-only">
            Repo folder path
          </label>
          <input
            id="repo-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            autoFocus
            placeholder="Absolute path to a repo, e.g. D:\code\my-app"
            className="min-h-10 flex-1 basis-80 rounded-lg border border-border bg-bg px-3 font-mono text-sm text-text placeholder:text-muted"
          />
          <button type="submit" disabled={add.isPending || !path.trim()} className="min-h-10 rounded-lg border border-border bg-surface px-3.5 text-sm font-semibold disabled:opacity-50">
            Add
          </button>
        </form>
      )}
      {add.error && (
        <p role="alert" className="m-0 text-sm text-error">
          {add.error.message}
        </p>
      )}
      {data.repos.length === 0 && <p className="m-0 text-sm text-muted">No repos yet. Add one to see its sessions, tasks and config here.</p>}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {data.repos.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <Link to="/repos/$repoId/config" params={{ repoId: r.id }} className="text-[15px] font-bold text-text hover:text-accent">
                {r.name}
              </Link>
              {r.branch && <span className="truncate font-mono text-xs text-muted">{r.branch}</span>}
            </div>
            <span className="break-all font-mono text-xs text-muted">{r.path}</span>
            <span className="text-[13px] text-soft">
              {r.sessionsThisWeek} session{r.sessionsThisWeek === 1 ? '' : 's'} this week · {r.openTasks} open task{r.openTasks === 1 ? '' : 's'}
            </span>
            {!r.exists && <span className="text-xs text-waiting">Folder not found</span>}
            {r.warnings.map((w) => (
              <span key={w} className="text-xs text-waiting">
                {w}
              </span>
            ))}
            <button type="button" onClick={() => remove.mutate(r.id)} aria-label={`Remove ${r.name}`} className="cursor-pointer self-start border-0 bg-transparent p-0 text-xs text-muted hover:text-error">
              Remove
            </button>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Tasks({ data }: { data: DashboardData }) {
  return (
    <section className={card}>
      <h2 className="m-0 text-[17px] font-bold">Tasks across repos</h2>
      {data.tasks.length === 0 && <p className="m-0 text-sm text-muted">No open tasks in recent sessions.</p>}
      {data.tasks.map((t) => (
        <Link key={`${t.sessionId}:${t.id}`} to="/sessions/$sessionId" params={{ sessionId: t.sessionId }} className="flex items-start gap-2.5 text-sm leading-snug text-text no-underline hover:text-accent">
          <span className={`mt-1 size-3.5 flex-none rounded border ${t.status === 'in_progress' ? 'border-accent bg-accent/30' : 'border-muted'}`} />
          <span className={`min-w-0 flex-1 ${t.status === 'in_progress' ? 'font-semibold' : ''}`}>{t.text}</span>
          <span className="whitespace-nowrap text-[11px] text-muted">{t.repoName}</span>
        </Link>
      ))}
    </section>
  )
}

function MemoryChanges({ data }: { data: DashboardData }) {
  return (
    <section className={card}>
      <h2 className="m-0 text-[17px] font-bold">Recent CLAUDE.md changes</h2>
      {data.memoryChanges.length === 0 && <p className="m-0 text-sm text-muted">No CLAUDE.md commits in the last 30 days.</p>}
      {data.memoryChanges.map((c) => (
        <div key={`${c.repoName}:${c.commit}:${c.file}`} className="flex flex-col gap-1 rounded-lg bg-surface-2 p-2.5">
          <span className="flex justify-between gap-2 text-xs text-muted">
            <span className="truncate font-mono">
              {c.repoName}/{c.file}
            </span>
            <span className="whitespace-nowrap">{timeAgo(c.date)}</span>
          </span>
          <span className="truncate text-[13px]" title={c.subject}>
            {c.subject}
          </span>
          <span className="font-mono text-xs">
            <span className="text-running">+{c.added}</span> <span className="text-error">-{c.removed}</span>
          </span>
        </div>
      ))}
    </section>
  )
}
