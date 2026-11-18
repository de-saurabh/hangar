import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { LIBRARY_KINDS, type LibraryKind } from '@hangar/shared'
import { api } from '../../api'
import { PageHeader } from '../../components/PageHeader'
import { Tabs } from '../../components/Tabs'
import { useScope } from '../../scope'
import { Backup } from './Backup'
import { ItemRow } from './ItemRow'
import { Templates } from './Templates'

const LABEL: Record<LibraryKind, string> = { commands: 'Commands', agents: 'Agents', skills: 'Skills', hooks: 'Hooks' }

/** Everything built for Claude Code, from every repo and from ~/.claude, in one place. */
export function LibraryPage() {
  const [scope] = useScope()
  const [kind, setKind] = useState<LibraryKind>('commands')
  const [filter, setFilter] = useState('')
  const { data, isPending, isError, error } = useQuery({ queryKey: ['library'], queryFn: api.library })
  const { data: repos = [] } = useQuery({ queryKey: ['repos'], queryFn: api.repos })

  // With a repo selected: that repo's items plus the global ones every repo can use.
  const visible = (data?.items ?? []).filter((i) => !scope || i.scope === 'user' || i.repoId === scope)
  const needle = filter.trim().toLowerCase()
  const items = visible.filter((i) => i.kind === kind && (!needle || `${i.name} ${i.description}`.toLowerCase().includes(needle)))
  const tabs = LIBRARY_KINDS.map((k) => ({ id: k, label: `${LABEL[k]} · ${visible.filter((i) => i.kind === k).length}` }))
  const scopeName = repos.find((r) => r.id === scope)?.name

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Library" subtitle={scopeName ? `What ${scopeName} can use: its own and the global ones.` : "Everything you've built for Claude Code, from every repo, in one place."} />

      <div className="grid grid-cols-1 gap-x-10 gap-y-8 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Tabs label="Kind" tabs={tabs} value={kind} onChange={setKind}>
            <div className="flex flex-col gap-2">
              <input
                type="search"
                aria-label="Filter library"
                placeholder={`Filter ${LABEL[kind].toLowerCase()}…`}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="mb-2 min-h-9 w-full max-w-md rounded-lg border border-border bg-surface px-3 text-text placeholder:text-dim focus:border-accent focus:outline-none"
              />
              {isPending && <p className="m-0 text-sm text-muted">Loading…</p>}
              {isError && <p className="m-0 text-sm text-error">Couldn't load the library: {error.message}</p>}
              {data && items.length === 0 && <p className="m-0 text-sm text-dim">{needle ? 'Nothing matches.' : `No ${LABEL[kind].toLowerCase()} found in ~/.claude or your repos.`}</p>}
              <ul className="m-0 list-none p-0">
                {items.map((i) => (
                  <ItemRow key={i.id} item={i} />
                ))}
              </ul>
            </div>
          </Tabs>
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          <Templates />
          <Backup />
        </aside>
      </div>
    </div>
  )
}
