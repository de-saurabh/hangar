import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { LiveState, SessionListItem } from '@hangar/shared'
import { api } from '../../api'
import { boardColumn, columnDot, LANES } from '../../board'
import { buttonClass, CopyButton } from '../../components/Button'
import { ContextBar } from '../../components/ContextMeter'
import { RepoAvatar } from '../../components/RepoAvatar'
import { resumeCommand } from '../../components/SessionCard'
import { Tag } from '../../components/Tag'
import { contextPct, formatCost, formatDuration, formatTokens, shortModel } from '../../format'
import { isActive } from '../../live'
import { timeAgo } from '../../time'
import { Timeline } from './Timeline'

/** One session in full: facts, timeline, files and problems. */
export function SessionDetail({ session: s, live }: { session: SessionListItem; live: LiveState | undefined }) {
  const alive = live !== undefined && isActive(live)
  const { data, isPending, isError } = useQuery({
    queryKey: ['session', s.id],
    queryFn: () => api.session(s.id),
    refetchInterval: alive ? 5000 : false,
  })
  const column = boardColumn(s, live)
  const status = LANES.find((l) => l.id === column)?.label ?? 'Finished'
  const pct = contextPct(s)
  const totalTokens = s.tokens.input + s.tokens.output + s.tokens.cacheRead + s.tokens.cacheCreation

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <RepoAvatar name={s.repoName} />
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-semibold leading-tight">{s.title}</h2>
          <p className="m-0 text-muted">
            {s.repoName}
            {s.gitBranch && ` · ${s.gitBranch}`} · {shortModel(s.model)}
          </p>
        </div>
        <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
          <span className={`size-2 rounded-full ${columnDot(column)}`} />
          {alive ? status : 'Finished'}
        </span>
      </div>

      {alive && (
        <p className="m-0 flex flex-wrap items-center gap-3 rounded-[9px] border border-warn-border bg-warn-bg px-3 py-2 text-[13.5px]">
          {live.status === 'waiting' ? 'This session is waiting for you.' : 'This session is still live.'} Act on live sessions from the Dashboard.
          <Link to="/" className={buttonClass()}>
            Go to Dashboard
          </Link>
        </p>
      )}

      <dl className="m-0 flex flex-wrap gap-x-9 gap-y-3 border-y border-border py-3.5">
        <Stat label="Started" value={s.startedAt ? timeAgo(s.startedAt) : '—'} />
        <Stat label="Length" value={formatDuration(s.startedAt, s.lastEventAt) || '—'} />
        <Stat label="Context used" value={pct === undefined ? '—' : `${pct}%`} />
        <Stat label="Files changed" value={data ? String(data.files.length) : '…'} />
        <Stat label="Tokens" value={`~${formatTokens(totalTokens)}`} />
        <Stat label="Cost" value={formatCost(s.costUSD)} />
        {s.compactions > 0 && <Stat label="Compactions" value={String(s.compactions)} />}
      </dl>

      {isPending && <p className="m-0 text-[13.5px] text-dim">Loading the timeline…</p>}
      {isError && <p className="m-0 text-[13.5px] text-error">Couldn't read this session's transcript.</p>}
      {data && (
        <div className="grid grid-cols-1 gap-8 min-[1300px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <H3>Timeline</H3>
            <Timeline events={data.events} start={s.startedAt} truncated={data.eventsTruncated} />
          </div>
          <div className="flex flex-col gap-5">
            <div>
              <H3>Files changed</H3>
              {data.files.length === 0 && <p className="m-0 text-[13.5px] text-dim">No files were changed.</p>}
              {data.files.map((f) => (
                <div key={f.path} className="flex justify-between gap-2.5 border-t border-border py-1.5 font-mono text-xs first:border-t-0">
                  <span className="truncate" title={f.path}>
                    {f.path}
                    {f.created ? ' (new)' : ''}
                  </span>
                  <span className="whitespace-nowrap">
                    <span className="text-running">+{f.added}</span> <span className="text-error">-{f.removed}</span>
                  </span>
                </div>
              ))}
            </div>
            {s.failures.length > 0 && (
              <div>
                <H3>Problems</H3>
                {s.failures.map((f) => (
                  <p key={f.key} className="m-0 flex items-center gap-2 py-1 text-[13.5px]">
                    <Tag tone="error">problem</Tag>
                    <span className="min-w-0 break-words">
                      <code className="font-mono text-[12.5px]">{f.key}</code> failed {f.count} time{f.count === 1 ? '' : 's'}
                    </span>
                  </p>
                ))}
              </div>
            )}
            {data.tasks.length > 0 && (
              <div>
                <H3>Task list</H3>
                {data.tasks.map((k) => (
                  <p key={k.id} className={`m-0 py-0.5 text-[13.5px] ${k.status === 'completed' ? 'text-muted line-through' : k.status === 'in_progress' ? 'font-semibold' : ''}`}>
                    {k.status === 'in_progress' ? '▶ ' : ''}
                    {k.text}
                  </p>
                ))}
              </div>
            )}
            <div>
              <H3>Context window</H3>
              <ContextBar s={s} />
              <p className="m-0 mt-1 text-xs text-muted">
                {s.contextTokens !== undefined && s.contextWindow ? `~${formatTokens(s.contextTokens)} of ${formatTokens(s.contextWindow)} tokens at the last message (estimate).` : 'No usage recorded yet.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <CopyButton variant="primary" text={resumeCommand(s.id)} label="Copy resume command" />
      </div>
    </div>
  )
}

const H3 = ({ children }: { children: string }) => <h3 className="m-0 mb-2 text-[13px] font-semibold text-muted">{children}</h3>

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="m-0 text-[15px] font-semibold">{value}</dd>
    </div>
  )
}
