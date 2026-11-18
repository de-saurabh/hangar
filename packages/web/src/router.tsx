import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { Layout } from './Layout'
import { ConfigIndex } from './routes/ConfigIndex'
import { ConfigPage } from './routes/Config'
import { Dashboard } from './routes/dashboard/Dashboard'
import { LibraryPage } from './routes/Library'
import { InsightsPage } from './routes/Insights'
import { SessionPage } from './routes/Session'
import { SessionsPage } from './routes/Sessions'

const rootRoute = createRootRoute({ component: Layout })

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Dashboard })

const configIndexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/config', component: ConfigIndex })

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/repos/$repoId/config',
  component: function ConfigRoute() {
    const { repoId } = configRoute.useParams()
    return <ConfigPage repoId={repoId} />
  },
})

const sessionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/sessions', component: SessionsPage })

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions/$sessionId',
  component: function SessionRoute() {
    const { sessionId } = sessionRoute.useParams()
    return <SessionPage sessionId={sessionId} />
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
