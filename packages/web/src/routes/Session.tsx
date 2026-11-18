import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { EventKind, SessionEvent } from '@hangar/shared'
import { api } from '../api'
import { formatCost, formatDuration, formatTokens, offsetLabel, shortModel } from '../format'
import { timeAgo } from '../time'
import { ContextBar } from './Sessions'

type Filter = 'all' | 'you' | 'tools' | 'issues'
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['you', 'You & approvals'],
  ['tools', 'Tools & edits'],
  ['issues', 'Errors & compactions'],
]

const matches = (f: Filter, e: SessionEvent): boolean => {
  switch (f) {
    case 'all': return true
    case 'you': return e.kind === 'prompt'
    case 'tools': return e.kind === 'tool' || e.kind === 'edit'
    case 'issues': return e.kind === 'error' || e.kind === 'system' || e.failed === true
  }
}

const DOT: Record<EventKind, string> = {
  prompt: 'bg-accent',
  assistant: 'bg-muted',
  tool: 'bg-muted',
  edit: 'bg-running',
  error: 'bg-error',
  system: 'bg-done',
}

const card = 'flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-4'

export function SessionPage({ sessionId }: { sessionId: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.session(sessionId),
    refetchInterval: 5000,
  })
  const [filter, setFilter] = useState<Filter>('all')
  const [copied, setCopied] = useState(false)

  if (isPending) return <p className="text-sm text-muted">Loading session…</p>
  if (isError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-error">Couldn't load this session: {error.message}</p>
        <Link to="/sessions" className="text-sm">← All sessions</Link>
      </div>
    )
  }

  const { session: s, events, files, eventsTruncated } = data
  const shown = events.filter((e) => matches(filter, e))
  const resume = `claude --resume ${s.id}`
  const totalTokens = s.tokens.input + s.tokens.output + s.tokens.cacheRead + s.tokens.cacheCreation

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resume)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked: the command stays visible to copy by hand
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/sessions" className="text-sm text-muted no-underline hover:text-text">← All sessions</Link>

      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] text-muted">
            {s.repoName}
            {s.gitBranch ? ` · ${s.gitBranch}` : ''}
          </span>
          <h1 className="m-0 text-[28px] font-bold">{s.title}</h1>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-muted">
            <span>{shortModel(s.model)}</span>
            {s.startedAt && <span>Started {timeAgo(s.startedAt)}</span>}
            <span>{formatDuration(s.startedAt, s.lastEventAt)} long</span>
            <span title="Cache reads included. Approximate: derived from the transcript.">~{formatTokens(totalTokens)} tokens</span>
            <span title="As reported by Claude Code. Missing while a session is still live.">{formatCost(s.costUSD)}</span>
            <span>
              {s.compactions} compaction{s.compactions === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface py-2 pl-3 pr-2">
          <code className="font-mono text-[13px]">{resume}</code>
          <button type="button" onClick={copy} className="min-h-9 cursor-pointer rounded-lg border-0 bg-accent px-3 text-[13px] font-bold text-bg">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section className={`${card} min-w-0 flex-[999_1_560px] gap-3 p-[18px]`}>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h2 className="m-0 text-[17px] font-bold">Timeline</h2>
            <div role="tablist" aria-label="Filter timeline" className="flex flex-wrap gap-1.5">
              {FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={`min-h-9 cursor-pointer rounded-lg border px-3 text-[13px] font-semibold ${filter === id ? 'border-accent bg-[#1e2738] text-text' : 'border-border bg-transparent text-muted hover:text-text'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {eventsTruncated && <p className="m-0 text-xs text-waiting">Timeline cut short: this session is very long, showing the first events only.</p>}
          {shown.length === 0 && <p className="m-0 text-sm text-muted">Nothing matches this filter.</p>}
          {shown.map((e) => (
            <EventRow key={e.id} e={e} start={s.startedAt} />
          ))}
        </section>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <section className={card}>
            <h2 className="m-0 text-base font-bold">Context window</h2>
            <ContextBar s={s} />
            <span className="text-[13px] text-muted">
              {s.contextTokens !== undefined && s.contextWindow
                ? `~${formatTokens(s.contextTokens)} of ${formatTokens(s.contextWindow)} tokens (estimate).`
                : 'No usage recorded yet.'}
              {s.compactions > 0 && ` Compacted ${s.compactions} time${s.compactions === 1 ? '' : 's'}. Long sessions lose detail after compaction.`}
            </span>
          </section>

          <section className={card}>
            <h2 className="m-0 text-base font-bold">Files changed</h2>
            {files.length === 0 && <span className="text-[13px] text-muted">No edits in this session.</span>}
            {files.map((f) => (
              <div key={f.path} className="flex justify-between gap-2.5 font-mono text-xs">
                <span className="truncate" title={f.path}>{f.path}{f.created ? ' (new)' : ''}</span>
                <span className="whitespace-nowrap">
                  <span className="text-running">+{f.added}</span> <span className="text-error">-{f.removed}</span>
                </span>
              </div>
            ))}
            <span className="text-xs text-muted">Counted from edit results in the transcript.</span>
          </section>
        </aside>
      </div>
    </div>
  )
}

function EventRow({ e, start }: { e: SessionEvent; start: string | undefined }) {
  const failed = e.failed === true
  const mono = e.kind === 'tool' || e.kind === 'edit'
  return (
    <div className="flex gap-3">
      <span className="w-[52px] flex-none pt-[3px] font-mono text-xs text-muted">{offsetLabel(start, e.t)}</span>
      <span className={`mt-[5px] size-2.5 flex-none rounded-full ${failed ? 'bg-error' : DOT[e.kind]}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 border-b border-[#1e222b] pb-2.5">
        <span className="text-xs font-bold tracking-[0.04em] text-muted">
          {e.label}
          {failed ? ' · FAILED' : ''}
        </span>
        <span className={`break-words text-text ${mono ? 'font-mono text-[13px]' : 'text-sm leading-normal'}`}>{e.text}</span>
        {e.note && <span className="text-xs text-muted">{e.note}</span>}
      </div>
    </div>
  )
}
