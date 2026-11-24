import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { RequireAuth, RequirePermission } from './components/RouteGuards'
import { LoadingState } from './components/StateViews'
import LoginPage from './pages/login/LoginPage'
import NotFoundPage from './pages/NotFoundPage'

// Pages are code-split so the first load only downloads what the current screen needs.
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const ProjectsPage = lazy(() => import('./pages/projects/ProjectsPage'))
const ProjectDetailPage = lazy(() => import('./pages/projects/ProjectDetailPage'))
const DeliverablesPage = lazy(() => import('./pages/deliverables/DeliverablesPage'))
const ResourcesPage = lazy(() => import('./pages/resources/ResourcesPage'))
const ResourceDetailPage = lazy(() => import('./pages/resources/ResourceDetailPage'))
const BudgetPage = lazy(() => import('./pages/budget/BudgetPage'))
const UsersPage = lazy(() => import('./pages/users/UsersPage'))

function page(permission, Page) {
  return (
    <RequirePermission permission={permission}>
      <Suspense fallback={<LoadingState />}>
        <Page />
      </Suspense>
    </RequirePermission>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={page('dashboard:read', DashboardPage)} />
        <Route path="projects" element={page('projects:read', ProjectsPage)} />
        <Route path="projects/:projectId" element={page('projects:read', ProjectDetailPage)} />
        <Route path="deliverables" element={page('deliverables:read', DeliverablesPage)} />
        <Route path="resources" element={page('resources:read', ResourcesPage)} />
        <Route path="resources/:resourceId" element={page('resources:read', ResourceDetailPage)} />
        <Route path="budget" element={page('expenses:read', BudgetPage)} />
        <Route path="users" element={page('users:read', UsersPage)} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
