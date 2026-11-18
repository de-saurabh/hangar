const COLORS = ['#c2410c', '#0f766e', '#6d28d9', '#b91c1c', '#1d4ed8', '#a16207', '#be185d', '#047857']

/** A repo's coloured initial. The colour comes from the name, so it is the same everywhere. */
export function RepoAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const initial = name.replace(/^[^a-z0-9]+/i, '').charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      style={{ background: COLORS[hash % COLORS.length] }}
      className={`inline-grid flex-none place-items-center font-bold text-white ${size === 'sm' ? 'size-5 rounded-[5px] text-[11px]' : 'size-[26px] rounded-[7px] text-xs'}`}
    >
      {initial}
    </span>
  )
}
