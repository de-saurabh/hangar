import type { ReactNode } from 'react'

/** A filter you switch on and off. */
export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-8 cursor-pointer rounded-full border bg-surface px-3 text-[13px] hover:text-text ${on ? 'border-accent text-text' : 'border-border text-muted'}`}
    >
      {children}
    </button>
  )
}

/** One choice out of a few, shown side by side. */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-lg border border-border bg-surface">
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`min-h-8 cursor-pointer border-0 px-3 text-[13px] ${value === id ? 'bg-hover font-semibold text-text' : 'bg-transparent text-muted hover:text-text'}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
