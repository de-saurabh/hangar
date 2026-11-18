export interface PaletteItem {
  id: string
  label: string
  /** Secondary text, e.g. the repo of a session. */
  hint?: string
  group: 'Go to' | 'Repos' | 'Sessions'
  /** Router path to open. */
  to: string
  params?: Record<string, string>
}

/**
 * Score a label against a query: 0 = no match. Prefix beats word-start beats
 * substring beats scattered characters. Case-insensitive.
 */
export function score(query: string, label: string): number {
  const q = query.trim().toLowerCase()
  if (q === '') return 1
  const l = label.toLowerCase()
  if (l.startsWith(q)) return 100 - Math.min(40, l.length - q.length)
  const words = l.split(/[\s/\\._-]+/)
  if (words.some((w) => w.startsWith(q))) return 70
  if (l.includes(q)) return 50
  // all characters in order, but spread out
  let i = 0
  for (const c of l) if (c === q[i]) i++
  return i === q.length && q.length >= 2 ? 20 : 0
}

export function rank(items: PaletteItem[], query: string, limit = 30): PaletteItem[] {
  return items
    .map((item) => ({ item, s: Math.max(score(query, item.label), score(query, `${item.hint ?? ''}`) * 0.6) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.item)
}

export const PAGES: PaletteItem[] = [
  { id: 'p-dash', label: 'Dashboard', group: 'Go to', to: '/' },
  { id: 'p-sessions', label: 'Sessions', group: 'Go to', to: '/sessions' },
  { id: 'p-insights', label: 'Insights', group: 'Go to', to: '/insights' },
  { id: 'p-library', label: 'Library', group: 'Go to', to: '/library' },
  { id: 'p-config', label: 'Config', group: 'Go to', to: '/config' },
]
