/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or a date for older. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d} days ago`
  return new Date(iso).toLocaleDateString()
}

/** How long ago a ms-epoch moment was, without the "ago": "12 min", "3 h". */
export const elapsed = (ms: number): string => timeAgo(new Date(ms).toISOString()).replace(/ ago$/, '')

/** Group label for a day: "Today", "Yesterday", a weekday within the last week, else "Nov 3". */
export function dayLabel(iso: string | undefined, now: Date = new Date()): string {
  const d = iso ? new Date(iso) : undefined
  if (!d || Number.isNaN(d.getTime())) return 'Earlier'
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
