import type { ReactNode } from 'react'

interface Props {
  label: string
  dot: string
  count: number
  empty: string
  /** The "needs you" lane is the only amber one. */
  attention?: boolean
  footer?: ReactNode
  children: ReactNode
}

/**
 * One of the four fixed Dashboard lanes. It always keeps its place: when empty
 * it shows one quiet line, and when full it scrolls inside itself.
 */
export function Lane({ label, dot, count, empty, attention, footer, children }: Props) {
  return (
    <section
      aria-label={label}
      className={`flex max-h-[640px] min-h-[300px] min-w-0 flex-col gap-2.5 overflow-auto rounded-[14px] p-3 ${
        attention ? 'border border-warn-border bg-warn-bg' : 'bg-surface-2'
      }`}
    >
      <h2 className={`sticky -top-3 z-[1] m-0 -mx-1 flex items-center gap-2 px-1 pb-1 pt-0.5 text-[14.5px] font-semibold ${attention ? 'bg-warn-bg' : 'bg-surface-2'}`}>
        <span className={`size-2 rounded-full ${dot}`} />
        {label}
        <span className="ml-auto font-medium text-dim">{count}</span>
      </h2>
      {count === 0 ? <p className="m-0 px-1 text-[13.5px] text-dim">{empty}</p> : children}
      {footer}
    </section>
  )
}
