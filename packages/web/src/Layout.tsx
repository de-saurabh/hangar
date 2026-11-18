import { useQuery } from '@tanstack/react-query'
import { Link, Outlet } from '@tanstack/react-router'
import { api } from './api'
import { useLiveFeed } from './live'

const navLink = 'rounded-lg px-3 py-2 text-sm text-muted no-underline hover:text-text'
const navActive = { className: 'rounded-lg bg-[#1e222b] px-3 py-2 text-sm font-semibold text-text no-underline' }

export function Layout() {
  useLiveFeed()
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b border-border bg-surface-2 px-7 py-3">
        <span className="flex items-center gap-2.5 text-lg font-bold">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
            <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
          </svg>
          Hangar
        </span>
        <nav aria-label="Main" className="flex gap-1">
          <Link to="/" className={navLink} activeProps={navActive} activeOptions={{ exact: true }}>
            Dashboard
          </Link>
          <Link to="/sessions" className={navLink} activeProps={navActive}>
            Sessions
          </Link>
          <Link to="/config" className={navLink} activeProps={navActive}>
            Config
          </Link>
        </nav>
        <HealthBadge />
      </header>
      <main className="mx-auto max-w-6xl px-7 pb-12 pt-6">
        <Outlet />
      </main>
    </div>
  )
}

function HealthBadge() {
  const { data, isError } = useQuery({ queryKey: ['health'], queryFn: api.health })
  if (isError) return <span className="ml-auto text-sm text-error">Server unreachable</span>
  if (!data) return null
  return (
    <span className="ml-auto text-sm text-muted">
      v{data.version} · {data.claudeHomeFound ? '~/.claude found' : '~/.claude not found'}
    </span>
  )
}
