import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { PAGES, rank, type PaletteItem } from './palette'

/** ⌘K / Ctrl+K: jump to a page, a repo's config or a session. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return open ? <Palette onClose={() => setOpen(false)} /> : null
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const ref = useRef<HTMLDialogElement>(null)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const repos = useQuery({ queryKey: ['repos'], queryFn: api.repos })
  const sessions = useQuery({ queryKey: ['sessions', ''], queryFn: () => api.sessions('') })

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const items = useMemo(() => {
    const all: PaletteItem[] = [
      ...PAGES,
      ...(repos.data ?? []).map((r): PaletteItem => ({ id: `r-${r.id}`, label: r.name, hint: 'Config', group: 'Repos', to: '/repos/$repoId/config', params: { repoId: r.id } })),
      ...(sessions.data ?? []).slice(0, 200).map((s): PaletteItem => ({ id: `s-${s.id}`, label: s.title, hint: s.repoName, group: 'Sessions', to: '/sessions/$sessionId', params: { sessionId: s.id } })),
    ]
    return rank(all, q)
  }, [q, repos.data, sessions.data])

  const go = (item: PaletteItem | undefined) => {
    if (!item) return
    onClose()
    void navigate({ to: item.to, ...(item.params ? { params: item.params } : {}) } as never)
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label="Command palette"
      className="mx-auto mt-[12vh] w-[min(640px,94vw)] rounded-[14px] border border-border bg-surface p-0 text-text backdrop:bg-black/60"
    >
      <input
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={items[active] ? `pal-${items[active].id}` : undefined}
        placeholder="Jump to a page, repo or session…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(items.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            go(items[active])
          }
        }}
        className="box-border w-full rounded-t-[14px] border-0 border-b border-border bg-transparent px-4 py-3.5 text-base text-text outline-none"
      />
      <ul id="palette-list" role="listbox" className="m-0 max-h-[50vh] list-none overflow-auto p-1.5">
        {items.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nothing matches.</li>}
        {items.map((it, i) => (
          <li
            key={it.id}
            id={`pal-${it.id}`}
            role="option"
            aria-selected={i === active}
            onMouseMove={() => setActive(i)}
            onClick={() => go(it)}
            ref={(el) => {
              if (i === active) el?.scrollIntoView({ block: 'nearest' })
            }}
            className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? 'bg-[#1e2738]' : ''}`}
          >
            <span className="min-w-0 truncate">{it.label}</span>
            <span className="shrink-0 text-xs text-muted">{it.hint ? `${it.group} · ${it.hint}` : it.group}</span>
          </li>
        ))}
      </ul>
    </dialog>
  )
}
