import type { SessionListItem } from '@hangar/shared'
import { contextPct } from '../format'

/** A thin bar and label showing how full the session's context window is. Turns amber when nearly full. */
export function ContextBar({ s }: { s: Pick<SessionListItem, 'contextTokens' | 'contextWindow'> }) {
  const pct = contextPct(s)
  if (pct === undefined) return null
  return (
    <span className="flex items-center gap-2" title="Estimate: window size is inferred from the transcript">
      <span className="h-1 w-14 overflow-hidden rounded-sm bg-subtle">
        <span className={`block h-full ${pct >= 60 ? 'bg-waiting' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs text-muted">ctx {pct}%</span>
    </span>
  )
}
