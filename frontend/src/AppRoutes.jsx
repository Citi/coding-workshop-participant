import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import { AUDIT_PAGE_ROLES, USERS_PAGE_ROLES } from './auth/permissions.js';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

// Signed-in pages load on demand to keep the first download small.
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage.jsx'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage.jsx'));
const DeliverablesPage = lazy(() => import('./pages/DeliverablesPage.jsx'));
const CapacityPage = lazy(() => import('./pages/CapacityPage.jsx'));
const BudgetPage = lazy(() => import('./pages/BudgetPage.jsx'));
const RiskPage = lazy(() => import('./pages/RiskPage.jsx'));
const AuditPage = lazy(() => import('./pages/AuditPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));

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
