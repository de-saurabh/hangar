import { Link } from '@tanstack/react-router'
import type { LiveState, SessionListItem } from '@hangar/shared'
import { LANES, type BoardColumn } from '../board'
import { formatCost } from '../format'
import { isActive } from '../live'
import { elapsed, timeAgo } from '../time'
import { buttonClass, CopyButton } from './Button'
import { ContextBar } from './ContextMeter'
import { RepoAvatar } from './RepoAvatar'

export const resumeCommand = (sessionId: string) => `claude --resume ${sessionId}`

interface Props {
  s: SessionListItem
  live: LiveState | undefined
  column: BoardColumn
  selected: boolean
  onSelect: (id: string) => void
}

/**
 * The one card in Hangar: a unit of work. The stripe on the left carries its
 * status. Both buttons are always visible; the primary one is filled only when
 * the session is waiting for you.
 */
export function SessionCard({ s, live, column, selected, onSelect }: Props) {
  const waiting = column === 'waiting'
  const stripe = LANES.find((l) => l.id === column)?.stripe ?? ''
  const detail = live && isActive(live) ? live.detail : undefined
  const age = live && isActive(live) ? `${live.status} ${elapsed(live.since)}` : s.lastEventAt ? timeAgo(s.lastEventAt) : ''

  return (
    <article
      onClick={() => onSelect(s.id)}
      className={`relative flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-[10px] border py-3 pl-4 pr-3.5 before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-[10px] ${stripe} ${
        selected ? 'border-accent' : 'border-border hover:border-accent/60'
      } bg-surface`}
    >
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        <RepoAvatar name={s.repoName} size="sm" />
        <b className="font-semibold text-text">{s.repoName}</b>
        {s.gitBranch && <span className="truncate font-mono text-xs">{s.gitBranch}</span>}
        {waiting && live && <span className="ml-auto whitespace-nowrap font-semibold text-waiting">{elapsed(live.since)} waiting</span>}
      </div>
      <button
        type="button"
        onClick={() => onSelect(s.id)}
        className="line-clamp-2 cursor-pointer border-0 bg-transparent p-0 text-left text-[15px] font-semibold leading-snug text-text"
      >
        {s.title}
      </button>
      {detail &&
        (waiting ? (
          <>
            <span className="mt-1 text-xs text-dim">Wants to run</span>
            <code title={detail} className="break-all rounded-md border border-border bg-bg px-2.5 py-2 font-mono text-[12.5px]">
              {detail}
            </code>
          </>
        ) : (
          <span title={detail} className="truncate font-mono text-xs text-muted">
            {detail}
          </span>
        ))}
      <div className="mt-1 flex items-center gap-2.5 text-xs text-muted">
        <ContextBar s={s} />
        <span>{age}</span>
        <span className="ml-auto text-text">{formatCost(s.costUSD)}</span>
      </div>
      <div className="mt-1.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <Link to="/sessions/$sessionId" params={{ sessionId: s.id }} className={buttonClass(waiting ? 'primary' : 'secondary')}>
          Open session
        </Link>
        <CopyButton text={resumeCommand(s.id)} label="Copy resume" />
      </div>
    </article>
  )
}
