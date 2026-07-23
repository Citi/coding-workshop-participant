import { Route, Routes } from 'react-router-dom';
import Layout from './components/common/Layout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { ProjectProvider } from './context/ProjectContext';
import BudgetPage from './pages/BudgetPage';
import DashboardPage from './pages/DashboardPage';
import DeliverablesPage from './pages/DeliverablesPage';
import ForbiddenPage from './pages/ForbiddenPage';
import LoginPage from './pages/LoginPage';
import ProjectDetailsPage from './pages/ProjectDetailsPage';
import ProjectsPage from './pages/ProjectsPage';
import ReportsPage from './pages/ReportsPage';
import ResourcesPage from './pages/ResourcesPage';
import UsersPage from './pages/UsersPage';
import { ACTIONS } from './utils/constants';

/**
 * Routing and per-route authorisation.
 *
 * Each route names the permission it needs, so the guard, the navigation and
 * the backend all read from one matrix. Nothing here is a security boundary --
 * the API re-checks every request -- but it keeps a user from landing on a
 * page that can only fail.
 *
 * ProjectProvider sits inside the protected tree so it only fetches once
 * someone is signed in, and is torn down on sign-out.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <ProjectProvider>
              <Layout />
            </ProjectProvider>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="forbidden" element={<ForbiddenPage />} />

          <Route element={<ProtectedRoute action={ACTIONS.VIEW_PROJECTS} />}>
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailsPage />} />
            <Route path="deliverables" element={<DeliverablesPage />} />
          </Route>

          <Route element={<ProtectedRoute action={ACTIONS.VIEW_ALLOCATION} />}>
            <Route path="resources" element={<ResourcesPage />} />
          </Route>

          <Route element={<ProtectedRoute action={ACTIONS.VIEW_BUDGETS} />}>
            <Route path="budget" element={<BudgetPage />} />
          </Route>

          <Route element={<ProtectedRoute action={ACTIONS.GENERATE_REPORTS} />}>
            <Route path="reports" element={<ReportsPage />} />
          </Route>

          <Route element={<ProtectedRoute action={ACTIONS.MANAGE_USERS} />}>
            <Route path="users" element={<UsersPage />} />
          </Route>

          {/* Unknown paths inside the app land on the dashboard rather than a
              dead end -- the nav is right there to redirect from. */}
          <Route path="*" element={<DashboardPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
