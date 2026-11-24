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

/**
 * A page behind its permission, its code downloaded on the first visit. `name` keys it, so every
 * page has its own Suspense boundary: opening another page replaces the previous one at once and
 * shows "Loading…" while the new page's code downloads. Sharing one boundary, React would keep the
 * previous page mounted and working during that navigation (a transition), and a delayed update
 * there, such as a search sent 300 ms after the last keystroke, could still change the URL and
 * take the user back.
 */
function page(name, permission, Page) {
  return (
    <RequirePermission key={name} permission={permission}>
      {/* Only the page's code is downloading here, not data: no "waking up the database" hint. */}
      <Suspense fallback={<LoadingState slowHint={null} />}>
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
        <Route index element={page('dashboard', 'dashboard:read', DashboardPage)} />
        <Route path="projects" element={page('projects', 'projects:read', ProjectsPage)} />
        <Route path="projects/:projectId" element={page('project', 'projects:read', ProjectDetailPage)} />
        <Route path="deliverables" element={page('deliverables', 'deliverables:read', DeliverablesPage)} />
        <Route path="resources" element={page('resources', 'resources:read', ResourcesPage)} />
        <Route path="resources/:resourceId" element={page('resource', 'resources:read', ResourceDetailPage)} />
        <Route path="budget" element={page('budget', 'expenses:read', BudgetPage)} />
        <Route path="users" element={page('users', 'users:read', UsersPage)} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
