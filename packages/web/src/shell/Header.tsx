import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '../api'
import { openPalette } from '../CommandPalette'
import { formatCost } from '../format'
import { useLive } from '../live'
import { getTheme, NEXT, setTheme } from '../theme'
import { NotifyMenu } from './NotifyMenu'

const navLink = 'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-muted no-underline hover:text-text'
const navActive = { className: 'inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 font-semibold text-text no-underline' }

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/sessions', label: 'Sessions' },
  { to: '/insights', label: 'Insights' },
  { to: '/library', label: 'Library' },
  { to: '/config', label: 'Config' },
] as const

export function Header() {
  const live = useLive()
  const waiting = [...live.values()].filter((s) => s.status === 'waiting').length
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-1.5 gap-y-2 border-b border-border bg-bg px-7 py-3">
      <span className="mr-4 flex items-center gap-2.5 text-[17px] font-bold">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
          <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </svg>
        Hangar
      </span>
      <nav aria-label="Main" className="flex gap-0.5">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={navLink} activeProps={navActive} activeOptions={{ exact: n.to === '/' }}>
            {n.label}
            {n.to === '/' && waiting > 0 && (
              <span className="rounded-full bg-waiting px-1.5 text-[11.5px] font-bold text-on-waiting" aria-label={`${waiting} waiting for you`}>
                {waiting}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <span className="flex-1" />
      <button
        type="button"
        onClick={openPalette}
        className="flex min-w-64 cursor-pointer items-center justify-between gap-8 rounded-[9px] border border-border bg-surface-2 px-3 py-1.5 text-[13.5px] text-dim"
      >
        Search sessions, repos, files
        <kbd className="font-mono text-xs text-muted">Ctrl K</kbd>
      </button>
      <BudgetMeter />
      <NotifyMenu />
      <ThemeToggle />
    </header>
  )
}

/** Today's spend, against the daily budget when one is set. */
function BudgetMeter() {
  const { data } = useQuery({ queryKey: ['usage', 1], queryFn: () => api.usage(1), refetchInterval: 60_000 })
  if (!data) return null
  const { todayCost, dailyBudgetUSD, over } = data.budget
  const pct = dailyBudgetUSD ? Math.min(100, (todayCost / dailyBudgetUSD) * 100) : 0
  return (
    <span className="mx-3.5 flex items-center gap-2.5 text-[13.5px] text-muted" title="Estimated from token counts">
      <span>
        <b className={`font-semibold ${over ? 'text-error' : 'text-text'}`}>{formatCost(todayCost)}</b>
        {dailyBudgetUSD ? ` / ${formatCost(dailyBudgetUSD)}` : ' today'}
      </span>
      {dailyBudgetUSD && (
        <span className="h-[5px] w-[90px] overflow-hidden rounded-[3px] bg-subtle" role="presentation">
          <span className={`block h-full ${over ? 'bg-error' : 'bg-waiting'}`} style={{ width: `${pct}%` }} />
        </span>
      )}
    </span>
  )
}

const THEME_LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' } as const

function ThemeToggle() {
  const [choice, setChoice] = useState(getTheme)
  return (
    <button
      type="button"
      aria-label={`Theme: ${THEME_LABEL[choice]}. Click to change.`}
      title={`Theme: ${THEME_LABEL[choice]}`}
      onClick={() => {
        const next = NEXT[choice]
        setTheme(next)
        setChoice(next)
      }}
      className="min-h-[34px] cursor-pointer rounded-lg border-0 bg-transparent px-2.5 text-xs font-semibold text-muted hover:bg-hover hover:text-text"
    >
      {THEME_LABEL[choice]}
    </button>
  )
}
