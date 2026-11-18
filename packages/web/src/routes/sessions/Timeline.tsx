import { useState } from 'react'
import type { EventKind, SessionEvent } from '@hangar/shared'
import { Chip } from '../../components/Controls'
import { offsetLabel } from '../../format'

type Filter = 'all' | 'you' | 'tools' | 'issues'
const FILTERS: readonly (readonly [Filter, string])[] = [
  ['all', 'All'],
  ['you', 'You'],
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

/** Everything that happened in a session, in order, with a filter for the kind of event. */
export function Timeline({ events, start, truncated }: { events: SessionEvent[]; start: string | undefined; truncated: boolean }) {
  const [filter, setFilter] = useState<Filter>('all')
  const shown = events.filter((e) => matches(filter, e))
  return (
    <div>
      <div className="mb-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filter timeline">
        {FILTERS.map(([id, label]) => (
          <Chip key={id} on={filter === id} onClick={() => setFilter(id)}>
            {label}
          </Chip>
        ))}
      </div>
      {truncated && <p className="m-0 mb-2 text-xs text-waiting">Timeline cut short: this session is very long, showing the first events only.</p>}
      {shown.length === 0 && <p className="m-0 text-[13.5px] text-dim">Nothing matches this filter.</p>}
      {shown.map((e) => (
        <div key={e.id} className="grid grid-cols-[52px_12px_minmax(0,1fr)] gap-2 border-t border-border py-2 first:border-t-0">
          <span className="pt-0.5 font-mono text-xs text-dim">{offsetLabel(start, e.t)}</span>
          <span className={`mt-1.5 size-2.5 rounded-full ${e.failed ? 'bg-error' : DOT[e.kind]}`} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-semibold text-muted">
              {e.label}
              {e.failed ? ' · failed' : ''}
            </span>
            <span className={`break-words ${e.kind === 'tool' || e.kind === 'edit' ? 'font-mono text-[13px]' : 'text-sm leading-normal'}`}>{e.text}</span>
            {e.note && <span className="text-xs text-muted">{e.note}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
