import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface TabDef<T extends string> {
  id: T
  label: ReactNode
}

interface Props<T extends string> {
  label: string
  tabs: readonly TabDef<T>[]
  value: T
  onChange: (id: T) => void
  /** The content of the selected tab. */
  children: ReactNode
}

/**
 * Tabs for switching between views of the same page (not for navigation).
 * Arrow keys, Home and End move between tabs and select as they go; only the
 * selected tab is in the Tab order. The tab row scrolls instead of wrapping.
 */
export function Tabs<T extends string>({ label, tabs, value, onChange, children }: Props<T>) {
  const base = useId()
  const buttons = useRef(new Map<T, HTMLButtonElement>())
  const tabId = (id: T) => `${base}-${id}`

  const move = (e: KeyboardEvent, from: number) => {
    const last = tabs.length - 1
    const to = { ArrowRight: from === last ? 0 : from + 1, ArrowLeft: from === 0 ? last : from - 1, Home: 0, End: last }[e.key]
    if (to === undefined) return
    e.preventDefault()
    const next = tabs[to]!.id
    onChange(next)
    buttons.current.get(next)?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-border">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={tabId(t.id)}
            ref={(el) => {
              if (el) buttons.current.set(t.id, el)
            }}
            type="button"
            role="tab"
            aria-selected={t.id === value}
            tabIndex={t.id === value ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => move(e, i)}
            className="relative flex-none cursor-pointer whitespace-nowrap border-0 bg-transparent px-3.5 py-2.5 text-[14.5px] text-muted hover:text-text aria-selected:text-text aria-selected:after:absolute aria-selected:after:inset-x-0 aria-selected:after:-bottom-px aria-selected:after:border-b-2 aria-selected:after:border-accent"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={tabId(value)} tabIndex={0} className="pt-4">
        {children}
      </div>
    </div>
  )
}
