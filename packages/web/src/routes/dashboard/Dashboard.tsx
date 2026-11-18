import { useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { api } from '../../api'
import { buildBoard, LANES, withLiveOnly } from '../../board'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/PageHeader'
import { SessionCard } from '../../components/SessionCard'
import { useLive } from '../../live'
import { useScope } from '../../scope'
import { Lane } from './Lane'
import { SessionPanel } from './SessionPanel'
import { ChangesSection, ContextSection, SpendSection, TasksSection } from './Summaries'

/** Four equal columns on wide screens, two on narrow ones. The layout never depends on the data. */
const GRID = 'grid grid-cols-2 gap-5 min-[1100px]:grid-cols-4'

export function Dashboard() {
  const [scope] = useScope()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showOther, setShowOther] = useState(false)
  const live = useLive()
  const closePanel = useCallback(() => setSelectedId(null), [])

  const sessions = useQuery({ queryKey: ['sessions', ''], queryFn: () => api.sessions(), refetchInterval: 15_000 })
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 15_000 })
  const { data: repos = [] } = useQuery({ queryKey: ['repos'], queryFn: api.repos })

  if (sessions.isPending) return <p className="text-sm text-muted">Loading…</p>
  if (sessions.isError) return <p className="text-sm text-error">Couldn't load sessions: {sessions.error.message}</p>

  const scopeName = repos.find((r) => r.id === scope)?.name
  const inScope = <T extends { repoName: string }>(x: T) => !scopeName || x.repoName === scopeName
  const all = withLiveOnly(sessions.data, live, repos)
  const board = buildBoard(all, live, scope, showOther)
  const alive = [...board.lanes.waiting, ...board.lanes.running, ...board.lanes.idle]
  const selected = all.find((s) => s.id === selectedId)

  const subtitle = scopeName
    ? `${scopeName}: ${board.lanes.waiting.length} need you, ${board.lanes.running.length} running.`
    : `Everything Claude is doing across your repos: ${board.lanes.waiting.length} need you, ${board.lanes.running.length} running.`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" subtitle={subtitle} />

      <div className={GRID}>
        {LANES.map((lane) => {
          const items = board.lanes[lane.id]
          return (
            <Lane
              key={lane.id}
              label={lane.label}
              dot={lane.dot}
              count={items.length}
              empty={lane.id === 'waiting' && scopeName ? `Nothing needs you in ${scopeName}.` : lane.empty}
              attention={lane.id === 'waiting'}
              footer={
                lane.id === 'waiting' && items.length > 0 ? (
                  <p className="m-0 mt-auto px-1 text-[12.5px] text-muted">Approve in the terminal where the session runs. Hangar never approves for you.</p>
                ) : lane.id === 'finished' && (board.hiddenOther > 0 || showOther) ? (
                  <Button variant="quiet" className="mt-auto self-start" onClick={() => setShowOther(!showOther)}>
                    {showOther ? 'Hide other folders' : `Show ${board.hiddenOther} from other folders`}
                  </Button>
                ) : null
              }
            >
              {items.map((s) => (
                <SessionCard key={s.id} s={s} live={live.get(s.id)} column={lane.id} selected={s.id === selectedId} onSelect={setSelectedId} />
              ))}
            </Lane>
          )
        })}
      </div>

      <div className={GRID}>
        <SpendSection />
        <ContextSection sessions={alive} onSelect={setSelectedId} />
        <TasksSection tasks={(dashboard.data?.tasks ?? []).filter(inScope)} />
        <ChangesSection changes={(dashboard.data?.memoryChanges ?? []).filter(inScope)} />
      </div>

      <SessionPanel session={selected} live={selected ? live.get(selected.id) : undefined} onClose={closePanel} />
    </div>
  )
}
