import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { DashboardMemoryChange, SessionListItem, TaskItemView } from '@hangar/shared'
import { api } from '../../api'
import { RepoAvatar } from '../../components/RepoAvatar'
import { EmptyLine, Section } from '../../components/Section'
import { contextPct, formatCost, formatTokens } from '../../format'
import { timeAgo } from '../../time'

const linkClass = 'text-accent no-underline hover:underline'
const TASKS_SHOWN = 5
/** Sessions at or above this share of the context window are listed as filling up. */
const CONTEXT_WARN_PCT = 60

/** The last 7 days of spend as bars, against the daily budget when one is set. */
export function SpendSection() {
  const { data } = useQuery({ queryKey: ['usage', 7], queryFn: () => api.usage(7) })
  const budget = data?.budget.dailyBudgetUSD ?? null
  const days = data?.days ?? []
  const top = Math.max(budget ?? 0, ...days.map((d) => d.cost), 0.01)
  return (
    <Section title="Spend" action={<Link to="/insights" className={linkClass}>Insights</Link>}>
      {data ? (
        <>
          <p className="m-0 text-[26px] font-bold tabular-nums">{formatCost(data.budget.todayCost)}</p>
          <p className="m-0 text-[13px] text-muted">
            {budget ? `of ${formatCost(budget)} daily budget · ` : 'today · '}
            {formatTokens(days.at(-1)?.newTokens ?? 0)} tokens · estimate
          </p>
          <div role="img" aria-label={`Spend per day, last 7 days. Today ${formatCost(data.budget.todayCost)}.`} className="relative mt-3 flex h-[70px] items-end gap-1.5">
            {budget && <span className="absolute inset-x-0 border-t border-dashed border-waiting" style={{ bottom: `${(budget / top) * 100}%` }} />}
            {days.map((d, i) => (
              <span
                key={d.date}
                title={`${d.date}: ${formatCost(d.cost)}`}
                className={`flex-1 rounded-t-[3px] ${i === days.length - 1 ? 'bg-accent' : 'bg-track'}`}
                style={{ height: `${Math.max((d.cost / top) * 100, 3)}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-dim">
            <span>{days.length} days ago</span>
            <span>today</span>
          </div>
        </>
      ) : (
        <EmptyLine>Loading…</EmptyLine>
      )}
    </Section>
  )
}

export function ContextSection({ sessions, onSelect }: { sessions: SessionListItem[]; onSelect: (id: string) => void }) {
  const filling = sessions
    .map((s) => ({ s, pct: contextPct(s) ?? 0 }))
    .filter((x) => x.pct >= CONTEXT_WARN_PCT)
    .sort((a, b) => b.pct - a.pct)
  return (
    <Section title="Context filling up">
      {filling.length === 0 && <EmptyLine>No live session is close to a full context window.</EmptyLine>}
      {filling.map(({ s, pct }) => (
        <button key={s.id} type="button" onClick={() => onSelect(s.id)} className="flex w-full cursor-pointer flex-col gap-0.5 border-0 bg-transparent py-1.5 text-left text-text">
          <span className="truncate font-medium">{s.title}</span>
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <RepoAvatar name={s.repoName} size="sm" />
            {s.repoName}
            <span className="flex-1" />
            <span className="h-1 w-14 overflow-hidden rounded-sm bg-subtle">
              <span className="block h-full bg-waiting" style={{ width: `${pct}%` }} />
            </span>
            {pct}%
          </span>
        </button>
      ))}
      {filling.length > 0 && <EmptyLine>These are close to a full context window.</EmptyLine>}
    </Section>
  )
}

export function TasksSection({ tasks }: { tasks: TaskItemView[] }) {
  return (
    <Section title="Open tasks" count={tasks.length}>
      {tasks.length === 0 && (
        <>
          <EmptyLine>No open tasks in recent sessions.</EmptyLine>
          <EmptyLine>Tasks appear here when a session keeps a to-do list.</EmptyLine>
        </>
      )}
      {tasks.slice(0, TASKS_SHOWN).map((t) => (
        <Link key={`${t.sessionId}:${t.id}`} to="/sessions/$sessionId" params={{ sessionId: t.sessionId }} className="flex flex-col gap-0.5 py-1.5 text-text no-underline hover:text-accent">
          <span className={t.status === 'in_progress' ? 'font-semibold' : ''}>{t.text}</span>
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <RepoAvatar name={t.repoName} size="sm" />
            {t.repoName}
            {t.status === 'in_progress' && <span className="text-running">in progress</span>}
          </span>
        </Link>
      ))}
      {tasks.length > TASKS_SHOWN && <EmptyLine>+ {tasks.length - TASKS_SHOWN} more in recent sessions</EmptyLine>}
    </Section>
  )
}

export function ChangesSection({ changes }: { changes: DashboardMemoryChange[] }) {
  return (
    <Section title="Instruction changes" action={<Link to="/config" className={linkClass}>Config</Link>}>
      {changes.length === 0 && <EmptyLine>No CLAUDE.md commits in the last 30 days.</EmptyLine>}
      {changes.map((c) => (
        <div key={`${c.repoName}:${c.commit}:${c.file}`} className="flex flex-col gap-0.5 py-1.5">
          <span className="truncate" title={c.subject}>
            {c.subject}
          </span>
          <span className="flex gap-2 text-[13px] text-muted">
            <span className="truncate">{c.repoName}/{c.file}</span>
            <span className="whitespace-nowrap">{timeAgo(c.date)}</span>
            <span className="font-mono text-xs"><span className="text-running">+{c.added}</span> <span className="text-error">-{c.removed}</span></span>
          </span>
        </div>
      ))}
    </Section>
  )
}
