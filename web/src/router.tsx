import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import App from './App'
import Home from './pages/Home'

import LayersPage from './features/layers/LayersPage'
import SettingsPage from './features/settings/SettingsPage'

const rootRoute = createRootRoute({
  component: App,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
})

const layersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/layers',
  component: LayersPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([indexRoute, layersRoute, settingsRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
