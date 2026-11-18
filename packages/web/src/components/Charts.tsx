export interface Bar {
  key: string
  value: number
  /** Shown on hover. */
  title: string
  /** Short label under the bar. */
  label?: string
}

/** Bars over a day axis. The last bar is today; bars over `limit` turn amber. */
export function DayBars({ bars, height, limit, ariaLabel }: { bars: Bar[]; height: number; limit?: number | null; ariaLabel: string }) {
  const top = Math.max(limit ?? 0, ...bars.map((b) => b.value), 0.01)
  const labelled = bars.some((b) => b.label)
  return (
    <div>
      <div role="img" aria-label={ariaLabel} className="relative flex items-end gap-1.5" style={{ height }}>
        {limit ? <span className="absolute inset-x-0 border-t border-dashed border-waiting" style={{ bottom: `${(limit / top) * 100}%` }} /> : null}
        {bars.map((b, i) => (
          <span
            key={b.key}
            title={b.title}
            className={`flex-1 rounded-t-[3px] ${limit && b.value > limit ? 'bg-waiting' : i === bars.length - 1 ? 'bg-accent' : 'bg-track'}`}
            style={{ height: `${Math.max(b.value > 0 ? 3 : 0, (b.value / top) * 100)}%` }}
          />
        ))}
      </div>
      {labelled && (
        <div className="mt-1 flex gap-1.5 text-[11px] text-dim" aria-hidden="true">
          {bars.map((b) => (
            <span key={b.key} className="min-w-0 flex-1 text-center">
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export interface BarRow {
  name: string
  value: number
  text: string
}

/** Horizontal bars, longest first, for "where did it go" breakdowns. */
export function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0.01)
  if (rows.length === 0) return <p className="m-0 py-1 text-[13.5px] text-dim">{empty}</p>
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-2.5 text-[13.5px]">
          <span className="w-28 shrink-0 truncate" title={r.name}>
            {r.name}
          </span>
          <span className="h-2 min-w-0 flex-1 rounded bg-subtle">
            <span className="block h-full rounded bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="w-16 shrink-0 text-right font-mono text-xs text-muted">{r.text}</span>
        </li>
      ))}
    </ul>
  )
}
