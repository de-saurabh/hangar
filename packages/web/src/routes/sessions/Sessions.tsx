import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../../api'
import { Chip, Segmented } from '../../components/Controls'
import { PageHeader } from '../../components/PageHeader'
import { formatCost } from '../../format'
import { useLive } from '../../live'
import { useScope } from '../../scope'
import { DEFAULT_FILTERS, filterSessions, modelFamily, type SortOrder, type TimeRange } from '../../sessionFilters'
import { SessionDetail } from './SessionDetail'
import { SessionList } from './SessionList'

const TIME_OPTIONS = [
  ['today', 'Today'],
  ['7d', '7 days'],
  ['all', 'All time'],
] as const satisfies readonly (readonly [TimeRange, string])[]

const SEARCH_DELAY_MS = 250

/**
 * The place to look back: search everything Claude did, narrow it down, and
 * read one session in full. Live status and actions stay on the Dashboard.
 */
export function SessionsPage({ sessionId }: { sessionId?: string }) {
  const [scope] = useScope()
  const live = useLive()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [time, setTime] = useState<TimeRange>('all')
  const [model, setModel] = useState<string | null>(null)
  const [problems, setProblems] = useState(false)
  const [sort, setSort] = useState<SortOrder>('recent')

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [search])

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['sessions', query],
    queryFn: () => api.sessions(query),
    refetchInterval: 15_000, // live changes also invalidate this via SSE
    placeholderData: (prev) => prev,
  })

  if (isPending) return <p className="text-sm text-muted">Loading sessions…</p>
  if (isError) return <p className="text-sm text-error">Couldn't load sessions: {error.message}</p>

  const families = [...new Set(data.map((s) => modelFamily(s.model)).filter(Boolean))].sort()
  const rows = filterSessions(data, { ...DEFAULT_FILTERS, scope, time, model, problems, sort })
  const selected = rows.find((s) => s.id === sessionId) ?? rows[0]
  const total = rows.reduce((sum, s) => sum + (s.costUSD ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Sessions" subtitle="Search and review everything Claude did. Live status and actions are on the Dashboard." />

      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search what you asked, what Claude said, files, branches…"
          aria-label="Search sessions"
          className="min-h-9 w-[420px] max-w-full shrink-0 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-dim focus:border-accent focus:outline-none"
        />
        <Segmented label="Time range" value={time} options={TIME_OPTIONS} onChange={setTime} />
        {families.map((f) => (
          <Chip key={f} on={model === f} onClick={() => setModel(model === f ? null : f)}>
            {f}
          </Chip>
        ))}
        <Chip on={problems} onClick={() => setProblems(!problems)}>
          Had problems
        </Chip>
        <Chip on={sort === 'cost'} onClick={() => setSort(sort === 'cost' ? 'recent' : 'cost')}>
          Most expensive first
        </Chip>
        <span className="ml-auto text-[13px] text-muted">
          {rows.length} session{rows.length === 1 ? '' : 's'} · {formatCost(total)}
        </span>
      </div>

      <div className="grid h-[calc(100vh-300px)] min-h-[520px] grid-cols-1 overflow-hidden rounded-[14px] border border-border bg-surface-2 min-[900px]:grid-cols-[minmax(380px,470px)_minmax(0,1fr)]">
        <div className="overflow-auto min-[900px]:border-r min-[900px]:border-border">
          {rows.length === 0 ? (
            <p className="m-0 p-6 text-[13.5px] text-dim">{query ? `No session matches "${query}".` : 'No sessions match these filters.'}</p>
          ) : (
            <SessionList sessions={rows} live={live} selectedId={selected?.id} query={query} byDay={sort === 'recent'} />
          )}
        </div>
        <div className="hidden overflow-auto bg-bg min-[900px]:block">
          {selected ? <SessionDetail key={selected.id} session={selected} live={live.get(selected.id)} /> : <p className="m-0 p-6 text-[13.5px] text-dim">Select a session to review it.</p>}
        </div>
      </div>
    </div>
  )
}
