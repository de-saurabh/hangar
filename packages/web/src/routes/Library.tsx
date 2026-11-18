import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { LIBRARY_KINDS, type LibraryItem, type LibraryKind } from '@hangar/shared'
import { api } from '../api'

const LABEL: Record<LibraryKind, string> = { commands: 'Commands', agents: 'Agents', skills: 'Skills', hooks: 'Hooks' }
const card = 'flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4'

export function LibraryPage() {
  const [kind, setKind] = useState<LibraryKind>('commands')
  const [q, setQ] = useState('')
  const { data, isPending, isError, error } = useQuery({ queryKey: ['library'], queryFn: api.library })

  const all = data?.items ?? []
  const count = (k: LibraryKind) => all.filter((i) => i.kind === k).length
  const needle = q.trim().toLowerCase()
  const items = all.filter((i) => i.kind === kind && (!needle || `${i.name} ${i.description}`.toLowerCase().includes(needle)))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold">Library</h1>
          <span className="text-sm text-muted">Everything you've built for Claude Code, from every repo, in one place.</span>
        </div>
        <div role="tablist" aria-label="Kind" className="flex flex-wrap gap-1.5">
          {LIBRARY_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-9 cursor-pointer rounded-lg border px-3 text-sm font-semibold ${kind === k ? 'border-accent bg-[#1E2738] text-text' : 'border-border bg-transparent text-muted'}`}
            >
              {LABEL[k]} · {count(k)}
            </button>
          ))}
        </div>
      </div>

      <input
        type="search"
        aria-label="Filter library"
        placeholder={`Filter ${LABEL[kind].toLowerCase()}…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="min-h-10 max-w-md rounded-lg border border-border bg-surface px-3 text-sm text-text"
      />

      {isPending && <p className="text-sm text-muted">Loading…</p>}
      {isError && <p className="text-sm text-error">Couldn't load the library: {error.message}</p>}
      {data && items.length === 0 && (
        <p className="text-sm text-muted">{needle ? 'Nothing matches.' : `No ${LABEL[kind].toLowerCase()} found in ~/.claude or your repos.`}</p>
      )}
      <section className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {items.map((i) => (
          <ItemCard key={i.id} item={i} />
        ))}
      </section>
    </div>
  )
}

function ItemCard({ item }: { item: LibraryItem }) {
  return (
    <div className={card}>
      <span className="break-all font-mono text-[15px] font-semibold">{item.kind === 'commands' ? `/${item.name}` : item.name}</span>
      {item.description && <span className="line-clamp-3 text-sm leading-snug text-[#C9CED7]">{item.description}</span>}
      <span className="text-xs text-muted">
        {item.scope === 'user' ? 'Global (~/.claude)' : `In ${item.repoName}`} · {item.path}
        {item.detail ? ` · ${item.detail}` : ''}
      </span>
    </div>
  )
}
