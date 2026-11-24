import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import { AUDIT_PAGE_ROLES, USERS_PAGE_ROLES } from './auth/permissions.js';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import { lazyPage } from './utils/lazyPage.js';

// Signed-in pages load on demand to keep the first download small. lazyPage marks a failed
// download so the page's ErrorBoundary offers a reload (see utils/lazyPage.js).
const DashboardPage = lazyPage(() => import('./pages/DashboardPage.jsx'));
const ProjectsPage = lazyPage(() => import('./pages/ProjectsPage.jsx'));
const ProjectDetailPage = lazyPage(() => import('./pages/ProjectDetailPage.jsx'));
const DeliverablesPage = lazyPage(() => import('./pages/DeliverablesPage.jsx'));
const CapacityPage = lazyPage(() => import('./pages/CapacityPage.jsx'));
const BudgetPage = lazyPage(() => import('./pages/BudgetPage.jsx'));
const RiskPage = lazyPage(() => import('./pages/RiskPage.jsx'));
const AuditPage = lazyPage(() => import('./pages/AuditPage.jsx'));
const UsersPage = lazyPage(() => import('./pages/UsersPage.jsx'));

/**
 * Route table (spec 12.3). Everything except /login and /register needs a signed-in user;
 * /audit is for ADMIN and PM, /users for ADMIN. Unknown paths show the 404 page.
 * @returns {JSX.Element} The routes.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="deliverables" element={<DeliverablesPage />} />
        <Route path="capacity" element={<CapacityPage />} />
        <Route path="budget" element={<BudgetPage />} />
        <Route path="risk" element={<RiskPage />} />
        <Route
          path="audit"
          element={
            <ProtectedRoute roles={AUDIT_PAGE_ROLES}>
              <AuditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute roles={USERS_PAGE_ROLES}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

/** Takes no props. */
AppRoutes.propTypes = {};
