import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '../api'
import { RepoAvatar } from '../components/RepoAvatar'
import { inRepo, isActive, useLive } from '../live'
import { useScope } from '../scope'
import { ManageRepos } from './ManageRepos'

/**
 * The repo scope: a flat strip under the header that filters everything below
 * it. It is navigation, so it is not a card: the selected repo is underlined.
 */
export function ScopeStrip() {
  const { data: repos = [] } = useQuery({ queryKey: ['repos'], queryFn: api.repos })
  const live = useLive()
  const [scope, setScope] = useScope()
  const active = [...live.values()].filter(isActive)

  const count = (match: (s: (typeof active)[number]) => boolean): ReactNode => {
    const mine = active.filter(match)
    const waiting = mine.filter((s) => s.status === 'waiting').length
    if (waiting) return <span className="text-xs font-semibold text-waiting">{waiting} waiting</span>
    const running = mine.filter((s) => s.status === 'running').length
    return running ? <span className="text-xs text-dim">{running}</span> : null
  }

  return (
    <div role="group" aria-label="Repo" className="flex items-center gap-1 overflow-x-auto border-b border-border px-7">
      <span className="mr-2.5 text-[12.5px] text-dim">Repo</span>
      <Tab selected={scope === null} onSelect={() => setScope(null)} badge={count(() => true)}>
        All repos
      </Tab>
      {repos.map((r) => (
        <Tab key={r.id} selected={scope === r.id} onSelect={() => setScope(r.id)} badge={count((s) => inRepo(s, r))}>
          <RepoAvatar name={r.name} size="sm" />
          {r.name}
        </Tab>
      ))}
      <ManageRepos />
    </div>
  )
}

function Tab({ selected, onSelect, badge, children }: { selected: boolean; onSelect: () => void; badge: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`-mb-px flex cursor-pointer items-center gap-2 whitespace-nowrap border-0 border-b-2 bg-transparent px-3 py-2.5 text-[14.5px] hover:text-text ${
        selected ? 'border-accent font-semibold text-text' : 'border-transparent text-muted'
      }`}
    >
      {children}
      {badge}
    </button>
  )
}
