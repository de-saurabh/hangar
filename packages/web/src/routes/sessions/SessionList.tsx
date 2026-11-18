import { Link } from '@tanstack/react-router'
import type { LiveState, SessionListItem } from '@hangar/shared'
import { boardColumn, columnDot } from '../../board'
import { Highlight } from '../../components/Highlight'
import { RepoAvatar } from '../../components/RepoAvatar'
import { Tag } from '../../components/Tag'
import { formatCost } from '../../format'
import { dayLabel, timeAgo } from '../../time'

interface Props {
  sessions: SessionListItem[]
  live: Map<string, LiveState>
  selectedId: string | undefined
  query: string
  /** Group rows under day headings (only meaningful when ordered by recency). */
  byDay: boolean
}

export function SessionList({ sessions, live, selectedId, query, byDay }: Props) {
  let lastDay = ''
  return (
    <ul className="m-0 list-none p-0">
      {sessions.map((s) => {
        const day = byDay ? dayLabel(s.lastEventAt) : ''
        const header = day !== lastDay ? day : ''
        lastDay = day
        const selected = s.id === selectedId
        return (
          <li key={s.id}>
            {header && <h3 className="m-0 border-t border-border px-4 pb-1 pt-3 text-xs font-semibold text-dim first:border-t-0">{header}</h3>}
            <Link
              to="/sessions/$sessionId"
              params={{ sessionId: s.id }}
              aria-current={selected ? 'true' : undefined}
              className={`block border-t border-border px-4 py-3 text-text no-underline hover:bg-surface ${selected ? 'bg-surface shadow-[inset_3px_0_0_var(--color-accent)]' : ''}`}
            >
              <span className="flex items-center gap-2.5">
                <span className={`size-2 flex-none rounded-full ${columnDot(boardColumn(s, live.get(s.id)))}`} />
                <b className="min-w-0 flex-1 truncate font-semibold">
                  <Highlight text={s.title} query={query} />
                </b>
                <span className="text-[13px] text-muted">{formatCost(s.costUSD)}</span>
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-2 pl-[18px] text-[12.5px] text-muted">
                <RepoAvatar name={s.repoName} size="sm" />
                <span>{s.repoName}</span>
                {s.lastEventAt && <span>· {timeAgo(s.lastEventAt)}</span>}
                {s.failures.length > 0 && <Tag tone="error">problem</Tag>}
                {s.compactions > 0 && <Tag>{s.compactions} compaction{s.compactions > 1 ? 's' : ''}</Tag>}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
