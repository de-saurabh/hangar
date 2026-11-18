import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api'
import { Segmented } from '../../components/Controls'
import { PageHeader } from '../../components/PageHeader'
import { Allowlist } from './Allowlist'
import { Shipped, Stuck } from './Summary'
import { ByModel, ByRepo, SpendChart, type Metric } from './Usage'

const METRICS = [
  ['cost', 'Cost'],
  ['tokens', 'Tokens'],
] as const satisfies readonly (readonly [Metric, string])[]

const USAGE_DAYS = 14

/** Fixed rows of equal sections: the layout never depends on the data. */
export function InsightsPage() {
  const [metric, setMetric] = useState<Metric>('cost')
  const usage = useQuery({ queryKey: ['usage', USAGE_DAYS], queryFn: () => api.usage(USAGE_DAYS), refetchInterval: 30_000 })
  const summary = useQuery({ queryKey: ['insights-summary'], queryFn: api.insightsSummary })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Insights" subtitle={`What the last ${USAGE_DAYS} days cost, where Claude got stuck, and what you shipped.`}>
        <Segmented label="Metric" value={metric} options={METRICS} onChange={setMetric} />
      </PageHeader>

      {usage.isError && <p className="m-0 text-sm text-error">Couldn't load usage: {usage.error.message}</p>}
      {usage.data && <SpendChart data={usage.data} metric={metric} />}

      <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-3">
        <ByRepo data={usage.data} metric={metric} />
        <ByModel data={usage.data} metric={metric} />
        <Shipped data={summary.data} />
      </div>
      <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-2">
        <Stuck data={summary.data} />
        <Allowlist />
      </div>
    </div>
  )
}
