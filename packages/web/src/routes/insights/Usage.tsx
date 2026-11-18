import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { UsageBucket, UsageInsightsResponse } from '@hangar/shared'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { BarList, DayBars } from '../../components/Charts'
import { EmptyLine, Section } from '../../components/Section'
import { formatCost, formatTokens, shortModel } from '../../format'

export type Metric = 'cost' | 'tokens'

const value = (b: { cost: number; newTokens: number }, metric: Metric) => (metric === 'cost' ? b.cost : b.newTokens)
const show = (n: number, metric: Metric) => (metric === 'cost' ? formatCost(n) : formatTokens(n))
const rowsOf = (buckets: UsageBucket[], metric: Metric, name: (b: UsageBucket) => string = (b) => b.name) =>
  buckets.slice(0, 6).map((b) => ({ name: name(b), value: value(b, metric), text: show(value(b, metric), metric) }))

/** Cost (or tokens) per day, with the daily budget drawn as a line. */
export function SpendChart({ data, metric }: { data: UsageInsightsResponse; metric: Metric }) {
  const budget = metric === 'cost' ? data.budget.dailyBudgetUSD : null
  const bars = data.days.map((d) => ({ key: d.date, value: value(d, metric), title: `${d.date}: ${show(value(d, metric), metric)}`, label: d.date.slice(8) }))
  return (
    <Section title={metric === 'cost' ? 'Estimated cost per day' : 'New tokens per day'}>
      <p className="m-0 mb-3 flex flex-wrap items-baseline gap-x-3 text-[13.5px] text-muted">
        <span>
          <b className="text-[22px] font-bold tabular-nums text-text">{show(value(data.totals, metric), metric)}</b> total
        </span>
        {metric === 'cost' && <BudgetEditor budget={data.budget.dailyBudgetUSD} />}
      </p>
      {data.budget.over && metric === 'cost' && (
        <p role="alert" className="m-0 mb-3 rounded-lg border border-error/60 bg-danger-bg px-3 py-2 text-[13.5px] text-error">
          Today is at {formatCost(data.budget.todayCost)}, over your {formatCost(data.budget.dailyBudgetUSD ?? 0)}/day budget.
        </p>
      )}
      <div className="max-w-4xl">
        <DayBars bars={bars} height={180} limit={budget} ariaLabel={`Bar chart of ${metric} per day`} />
      </div>
      {metric === 'cost' && data.costEstimated && <p className="m-0 mt-2 text-xs text-muted">Costs are estimates: a session's reported total is spread across days by token mix, and running sessions use the rate seen for the same model.</p>}
      {data.unpricedTokens > 0 && <p className="m-0 mt-1 text-xs text-muted">{formatTokens(data.unpricedTokens)} tokens from running sessions have no price yet.</p>}
    </Section>
  )
}

export function ByRepo({ data, metric }: { data: UsageInsightsResponse | undefined; metric: Metric }) {
  return (
    <Section title="By repo">
      {data ? <BarList rows={rowsOf(data.byRepo, metric)} empty="No usage yet." /> : <EmptyLine>Loading…</EmptyLine>}
    </Section>
  )
}

export function ByModel({ data, metric }: { data: UsageInsightsResponse | undefined; metric: Metric }) {
  return (
    <Section title="By model">
      {data ? <BarList rows={rowsOf(data.byModel, metric, (b) => shortModel(b.name))} empty="No usage yet." /> : <EmptyLine>Loading…</EmptyLine>}
    </Section>
  )
}

/** Shows the daily budget; click to change or clear it. The budget also feeds the header meter. */
function BudgetEditor({ budget }: { budget: number | null }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const save = useMutation({
    mutationFn: (v: number | null) => api.setPrefs({ dailyBudgetUSD: v }),
    onSuccess: () => {
      setEditing(false)
      void qc.invalidateQueries({ queryKey: ['usage'] })
    },
  })

  if (!editing) {
    return (
      <Button
        variant="quiet"
        className="min-h-0 border-0 p-0"
        onClick={() => {
          setText(budget === null ? '' : String(budget))
          setEditing(true)
        }}
      >
        {budget === null ? 'Set a daily budget' : `Budget ${formatCost(budget)}/day`}
      </Button>
    )
  }
  const n = Number(text)
  const valid = text.trim() !== '' && Number.isFinite(n) && n > 0
  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor="budget" className="sr-only">
        Daily budget in USD
      </label>
      $
      <input id="budget" autoFocus inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} className="w-20 rounded-md border border-border bg-bg px-2 py-1 text-text" />
      <Button variant="primary" disabled={!valid || save.isPending} onClick={() => save.mutate(n)}>
        Save
      </Button>
      {budget !== null && (
        <Button variant="quiet" onClick={() => save.mutate(null)}>
          Clear
        </Button>
      )}
    </span>
  )
}
