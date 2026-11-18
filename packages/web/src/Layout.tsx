import { Outlet, useRouterState } from '@tanstack/react-router'
import { CommandPalette } from './CommandPalette'
import { useLiveFeed } from './live'
import { Header } from './shell/Header'
import { ScopeStrip } from './shell/ScopeStrip'

/** Insights covers every repo at once, so the scope strip is hidden there. */
const UNSCOPED = ['/insights']

export function Layout() {
  useLiveFeed()
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <div className="min-h-screen">
      <CommandPalette />
      <Header />
      {!UNSCOPED.some((p) => path.startsWith(p)) && <ScopeStrip />}
      <main className="px-7 pb-20 pt-6">
        <Outlet />
      </main>
    </div>
  )
}
