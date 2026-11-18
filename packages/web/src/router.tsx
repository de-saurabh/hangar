import { createRootRoute, createRoute, createRouter, Navigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Layout } from './Layout'
import { ConfigPage } from './routes/config/Config'
import { Dashboard } from './routes/dashboard/Dashboard'
import { LibraryPage } from './routes/library/Library'
import { InsightsPage } from './routes/insights/Insights'
import { useScope } from './scope'
import { SessionsPage } from './routes/sessions/Sessions'

const rootRoute = createRootRoute({ component: Layout })

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Dashboard })

const configIndexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/config', component: ConfigPage })

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/repos/$repoId/config',
  component: function ConfigRedirect() {
    // Old links: pick that repo as the scope, then show the one Config page.
    const { repoId } = configRoute.useParams()
    const [, setScope] = useScope()
    useEffect(() => setScope(repoId), [repoId, setScope])
    return <Navigate to="/config" replace />
  },
})

const sessionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/sessions', component: () => <SessionsPage /> })

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions/$sessionId',
  component: function SessionRoute() {
    const { sessionId } = sessionRoute.useParams()
    return <SessionsPage sessionId={sessionId} />
  },
})

const insightsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/insights', component: InsightsPage })

const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/library', component: LibraryPage })

const routeTree = rootRoute.addChildren([indexRoute, sessionsRoute, sessionRoute, insightsRoute, libraryRoute, configIndexRoute, configRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
