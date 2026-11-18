export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return '—'
  if (usd > 0 && usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

/** 1234 -> "1.2k", 2_300_000 -> "2.3M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** "claude-opus-5-5" -> "Opus 5.5". Unknown shapes are returned unchanged. */
export function shortModel(model: string | undefined): string {
  if (!model) return 'unknown model'
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model)
  if (!m) return model
  const name = (m[1] ?? '').replace(/^./, (c) => c.toUpperCase())
  return m[3] ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`
}

/** Elapsed time between two ISO timestamps: "45 s", "12 min", "1 h 05". */
export function formatDuration(fromIso: string | undefined, toIso: string | undefined): string {
  if (!fromIso || !toIso) return ''
  const s = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000)
  if (!Number.isFinite(s) || s < 0) return ''
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = String(min % 60).padStart(2, '0')
  if (h < 24) return `${h} h ${rest}`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

/** Offset of an event from the session start: "0:09", "1:05:12". */
export function offsetLabel(startIso: string | undefined, atIso: string): string {
  if (!startIso) return ''
  const s = Math.max(0, Math.round((new Date(atIso).getTime() - new Date(startIso).getTime()) / 1000))
  if (!Number.isFinite(s)) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** How full the context window is, 0-100, or undefined when the transcript doesn't say. An estimate. */
export function contextPct(s: { contextTokens?: number; contextWindow?: number }): number | undefined {
  if (s.contextTokens === undefined || !s.contextWindow) return undefined
  return Math.min(100, Math.round((s.contextTokens / s.contextWindow) * 100))
}
