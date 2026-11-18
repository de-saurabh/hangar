import type { InsightsSummary } from '@hangar/shared'
import { EmptyLine, Section } from '../../components/Section'

export function Shipped({ data }: { data: InsightsSummary | undefined }) {
  return (
    <Section title="Shipped this week">
      {!data && <EmptyLine>Loading…</EmptyLine>}
      {data?.shipped.length === 0 && <EmptyLine>No sessions or commits this week.</EmptyLine>}
      {data?.shipped.map((s) => (
        <div key={s.repoName} className="flex flex-col gap-1 py-1.5 text-[13.5px]">
          <strong>{s.repoName}</strong>
          {s.commits.slice(0, 5).map((c) => (
            <span key={c.commit} className="text-muted">
              <code className="font-mono text-xs">{c.commit}</code> {c.subject}
            </span>
          ))}
          {s.commits.length === 0 && s.sessions.slice(0, 4).map((t) => <span key={t} className="text-muted">{t}</span>)}
          {s.commits.length > 0 && s.sessions.length > 0 && (
            <span className="text-xs text-dim">
              {s.sessions.length} session{s.sessions.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      ))}
    </Section>
  )
}

export function Stuck({ data }: { data: InsightsSummary | undefined }) {
  return (
    <Section title="Where Claude got stuck">
      {!data && <EmptyLine>Loading…</EmptyLine>}
      {data?.stuck.items.length === 0 && <EmptyLine>Nothing repeated. Good.</EmptyLine>}
      {data?.stuck.items.map((i) => (
        <div key={i.what} className="flex flex-wrap justify-between gap-2 border-t border-border py-2 text-[13.5px] first:border-t-0">
          <span>
            {i.what}
            {i.repoName && <span className="text-muted"> · {i.repoName}</span>}
          </span>
          <span className="text-muted">{i.detail}</span>
        </div>
      ))}
      {data?.stuck.tip && <p className="m-0 mt-2 text-xs text-accent">{data.stuck.tip}</p>}
    </Section>
  )
}
