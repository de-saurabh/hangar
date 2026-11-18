import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Suggestion, UsageBucket, UsageInsightsResponse } from '@hangar/shared'
import { api, type AllowBody } from '../api'
import { formatCost, formatTokens, shortModel } from '../format'
import { DiffView } from './HooksSetup'

const card = 'flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4'
const btn = 'min-h-9 cursor-pointer rounded-lg border border-border bg-transparent px-3 text-sm font-semibold text-text'

export function InsightsPage() {
  const [metric, setMetric] = useState<'cost' | 'tokens'>('cost')
  const usage = useQuery({ queryKey: ['insights-usage'], queryFn: () => api.usage(14), refetchInterval: 30_000 })
  const summary = useQuery({ queryKey: ['insights-summary'], queryFn: api.insightsSummary })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-xl font-bold">Insights · last 14 days</h1>
        <div role="tablist" aria-label="Metric" className="flex gap-1">
          {(['cost', 'tokens'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={metric === m} onClick={() => setMetric(m)} className={`${btn} ${metric === m ? 'border-accent text-accent' : ''}`}>
              {m === 'cost' ? 'Cost' : 'Tokens'}
            </button>
          ))}
        </div>
      </div>

      {usage.isError && <p className="text-sm text-error">Couldn't load usage: {usage.error.message}</p>}
      {usage.data && <UsageSection data={usage.data} metric={metric} />}

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[1_1_420px]">
          <Allowlist />
        </div>
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">
          <Shipped data={summary.data} />
          <Stuck data={summary.data} />
        </div>
      </div>
    </div>
  )
}

const val = (b: { cost: number; newTokens: number }, metric: 'cost' | 'tokens') => (metric === 'cost' ? b.cost : b.newTokens)
const show = (n: number, metric: 'cost' | 'tokens') => (metric === 'cost' ? formatCost(n) : formatTokens(n))

function UsageSection({ data, metric }: { data: UsageInsightsResponse; metric: 'cost' | 'tokens' }) {
  const max = Math.max(1, ...data.days.map((d) => val(d, metric)))
  const budget = data.budget.dailyBudgetUSD
  return (
    <section className={card} aria-label="Usage per day">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-bold">{metric === 'cost' ? 'Estimated cost per day' : 'New tokens per day'}</h2>
        <span className="text-sm text-muted">
          {show(val(data.totals, metric), metric)} total
          {metric === 'cost' && <BudgetEditor budget={budget} />}
        </span>
      </div>
      {data.budget.over && (
        <p role="alert" className="m-0 rounded-lg border border-error/60 bg-danger-bg px-3 py-2 text-sm text-error">
          Today is at {formatCost(data.budget.todayCost)}, over your {formatCost(budget ?? 0)}/day budget.
        </p>
      )}
      <div className="flex h-[180px] items-end gap-1.5" role="img" aria-label="Bar chart of usage per day">
        {data.days.map((d, i) => {
          const v = val(d, metric)
          const last = i === data.days.length - 1
          return (
            <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.date}: ${show(v, metric)}`}>
              <div className={`w-full rounded-t ${last ? 'bg-accent' : 'bg-accent/45'}`} style={{ height: `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%` }} />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 text-[11px] text-muted" aria-hidden="true">
        {data.days.map((d) => (
          <span key={d.date} className="min-w-0 flex-1 text-center">
            {d.date.slice(8)}
          </span>
        ))}
      </div>
      {metric === 'cost' && data.costEstimated && <p className="m-0 text-xs text-muted">Costs are estimates: a session's reported total is spread across days by token mix, and running sessions use the rate seen for the same model.</p>}
      {data.unpricedTokens > 0 && <p className="m-0 text-xs text-muted">{formatTokens(data.unpricedTokens)} tokens from running sessions have no price yet.</p>}
      <div className="flex flex-wrap gap-5">
        <Breakdown title="By repo" rows={data.byRepo} metric={metric} />
        <Breakdown title="By model" rows={data.byModel.map((b) => ({ ...b, name: shortModel(b.name) }))} metric={metric} />
      </div>
    </section>
  )
}

function Breakdown({ title, rows, metric }: { title: string; rows: UsageBucket[]; metric: 'cost' | 'tokens' }) {
  const max = Math.max(1, ...rows.map((r) => val(r, metric)))
  return (
    <div className="flex min-w-[260px] flex-1 flex-col gap-2">
      <h3 className="m-0 text-sm font-bold text-muted">{title}</h3>
      {rows.length === 0 && <p className="m-0 text-sm text-muted">No usage yet.</p>}
      {rows.slice(0, 6).map((r) => (
        <div key={r.name} className="flex items-center gap-2.5 text-sm">
          <span className="w-32 shrink-0 truncate" title={r.name}>
            {r.name}
          </span>
          <div className="h-2 min-w-0 flex-1 rounded bg-border">
            <div className="h-full rounded bg-accent" style={{ width: `${(val(r, metric) / max) * 100}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right font-mono text-xs text-muted">{show(val(r, metric), metric)}</span>
        </div>
      ))}
    </div>
  )
}

function BudgetEditor({ budget }: { budget: number | null }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const save = useMutation({
    mutationFn: (v: number | null) => api.setPrefs({ dailyBudgetUSD: v }),
    onSuccess: () => {
      setEditing(false)
      void qc.invalidateQueries({ queryKey: ['insights-usage'] })
    },
  })
  if (editing) {
    const n = Number(text)
    const valid = text.trim() !== '' && Number.isFinite(n) && n > 0
    return (
      <span className="ml-3 inline-flex items-center gap-1.5">
        <label className="sr-only" htmlFor="budget">
          Daily budget in USD
        </label>
        $<input id="budget" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} className="w-16 rounded border border-border bg-bg px-1.5 py-0.5 text-text" />
        <button type="button" disabled={!valid || save.isPending} onClick={() => save.mutate(n)} className="cursor-pointer border-0 bg-transparent p-0 text-accent disabled:opacity-50">
          Save
        </button>
        {budget !== null && (
          <button type="button" onClick={() => save.mutate(null)} className="cursor-pointer border-0 bg-transparent p-0 text-muted underline">
            Clear
          </button>
        )}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        setText(budget === null ? '' : String(budget))
        setEditing(true)
      }}
      className="ml-3 cursor-pointer border-0 bg-transparent p-0 text-accent underline"
    >
      {budget === null ? 'set a daily budget' : `budget ${formatCost(budget)}/day`}
    </button>
  )
}

function Allowlist() {
  const { data, isError } = useQuery({ queryKey: ['allowlist'], queryFn: api.allowlist, refetchInterval: 30_000 })
  const [pending, setPending] = useState<AllowBody>()
  return (
    <section className={card} aria-label="Allowlist suggestions">
      <h2 className="m-0 text-base font-bold">Allowlist suggestions</h2>
      <p className="m-0 text-sm text-muted">Commands you approved by hand 3 or more times. Needs live hooks to learn.</p>
      {isError && <p className="m-0 text-sm text-error">Couldn't load suggestions.</p>}
      {data?.suggestions.length === 0 && <p className="m-0 text-sm text-muted">Nothing to suggest yet.</p>}
      {data?.suggestions.map((s) => (
        <SuggestionRow key={s.rule} s={s} onAdd={setPending} />
      ))}
      {pending && <AllowDialog body={pending} onClose={() => setPending(undefined)} />}
    </section>
  )
}

function SuggestionRow({ s, onAdd }: { s: Suggestion; onAdd: (b: AllowBody) => void }) {
  const repoScope = s.scope !== 'global' ? s.scope : undefined
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
      <div className="min-w-0 flex-[1_1_200px]">
        <code className="break-all font-mono text-[13px]">{s.rule}</code>
        <div className="text-xs text-muted">
          approved {s.approvals}× in {s.repos.join(', ') || 'unknown'}
          {s.risky && <span className="ml-2 font-bold text-waiting">risky: keep asking</span>}
        </div>
      </div>
      {s.risky ? null : (
        <button type="button" className={btn} onClick={() => onAdd(repoScope ? { rule: s.rule, scope: 'repo', repoId: repoScope.repoId } : { rule: s.rule, scope: 'global' })}>
          {repoScope ? `Add to ${repoScope.repoName}` : 'Add to global allowlist'}
        </button>
      )}
    </div>
  )
}

/** Diff first; the write happens only on the confirm button, with a backup. */
function AllowDialog({ body, onClose }: { body: AllowBody; onClose: () => void }) {
  const qc = useQueryClient()
  const ref = useRef<HTMLDialogElement>(null)
  const { data: p, error } = useQuery({ queryKey: ['allow-preview', body], queryFn: () => api.allowPreview(body), gcTime: 0, retry: false })
  const [done, setDone] = useState<string>()
  const apply = useMutation({
    mutationFn: () => api.allowApply({ ...body, token: p!.token }),
    onSuccess: (r) => {
      setDone(r.backupPath ? `Done. Backup saved to ${r.backupPath}` : 'Done.')
      void qc.invalidateQueries({ queryKey: ['allowlist'] })
    },
  })
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(760px,92vw)] rounded-[14px] border border-border bg-surface p-0 text-text backdrop:bg-black/60">
      <div className="flex flex-col gap-3 p-5">
        <h2 className="m-0 text-lg font-bold">Add permission rule</h2>
        {!p && !error && <p className="m-0 text-sm text-muted">Reading settings…</p>}
        {error && <p role="alert" className="m-0 text-sm text-error">{error.message}</p>}
        {p && (
          <>
            <p className="m-0 text-sm text-muted">
              Adds <code className="font-mono text-text">{body.rule}</code> to <code className="break-all font-mono text-text">{p.path}</code>. Nothing else changes, and a backup is saved first.
            </p>
            {p.diff ? <DiffView diff={p.diff} /> : <p className="m-0 text-sm text-muted">Already allowed. Nothing to change.</p>}
          </>
        )}
        {apply.error && <p role="alert" className="m-0 text-sm text-error">{apply.error.message}</p>}
        {done && <p className="m-0 break-all text-sm text-running">{done}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={() => ref.current?.close()}>
            {done ? 'Close' : 'Cancel'}
          </button>
          {p?.diff && !done && (
            <button type="button" disabled={apply.isPending} onClick={() => apply.mutate()} className="min-h-9 cursor-pointer rounded-lg border-0 bg-accent px-3.5 text-sm font-bold text-bg disabled:opacity-50">
              {apply.isPending ? 'Writing…' : 'Add rule'}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}

function Shipped({ data }: { data: import('@hangar/shared').InsightsSummary | undefined }): ReactNode {
  return (
    <section className={card} aria-label="Shipped this week">
      <h2 className="m-0 text-base font-bold">This week you shipped</h2>
      {!data && <p className="m-0 text-sm text-muted">Loading…</p>}
      {data?.shipped.length === 0 && <p className="m-0 text-sm text-muted">No sessions or commits this week.</p>}
      {data?.shipped.map((s) => (
        <div key={s.repoName} className="flex flex-col gap-1 text-sm">
          <strong>{s.repoName}</strong>
          {s.commits.slice(0, 5).map((c) => (
            <span key={c.commit} className="text-muted">
              <code className="font-mono text-xs">{c.commit}</code> {c.subject}
            </span>
          ))}
          {s.commits.length === 0 && s.sessions.slice(0, 4).map((t) => <span key={t} className="text-muted">{t}</span>)}
          {s.commits.length > 0 && s.sessions.length > 0 && <span className="text-xs text-muted">{s.sessions.length} session{s.sessions.length === 1 ? '' : 's'}</span>}
        </div>
      ))}
    </section>
  )
}

function Stuck({ data }: { data: import('@hangar/shared').InsightsSummary | undefined }): ReactNode {
  return (
    <section className={card} aria-label="Where Claude got stuck">
      <h2 className="m-0 text-base font-bold">Where Claude got stuck</h2>
      {!data && <p className="m-0 text-sm text-muted">Loading…</p>}
      {data?.stuck.items.length === 0 && <p className="m-0 text-sm text-muted">Nothing repeated. Good.</p>}
      {data?.stuck.items.map((i) => (
        <div key={i.what} className="flex flex-wrap justify-between gap-2 text-sm">
          <span>
            {i.what}
            {i.repoName && <span className="text-muted"> · {i.repoName}</span>}
          </span>
          <span className="text-muted">{i.detail}</span>
        </div>
      ))}
      {data?.stuck.tip && <p className="m-0 text-xs text-accent">{data.stuck.tip}</p>}
    </section>
  )
}
