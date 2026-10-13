import PropTypes from 'prop-types';
import {
  Navigate, Route, Routes, useLocation, Link as RouterLink,
} from 'react-router-dom';
import { Button } from '@mui/material';
import { useAuth } from './services/AuthContext';
import AppShell from './components/AppShell';
import { EmptyState } from './components/StateViews';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TimePage from './pages/TimePage';
import PeoplePage from './pages/PeoplePage';
import ArchivePage from './pages/ArchivePage';

/** Redirects to sign-in when there is no session. */
function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

RequireAuth.propTypes = { children: PropTypes.node.isRequired };

/** Hides routes the current role may not use (the API enforces this too). */
function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) {
    return (
      <EmptyState title="You don't have access to this page" action={<Button component={RouterLink} to="/" variant="contained">Go to overview</Button>}>
        Ask an admin if you think you should.
      </EmptyState>
    );
  }
  return children;
}

RequireRole.propTypes = {
  roles: PropTypes.arrayOf(PropTypes.string).isRequired,
  children: PropTypes.node.isRequired,
};

function NotFound() {
  return (
    <EmptyState title="Page not found" action={<Button component={RouterLink} to="/" variant="contained">Go to overview</Button>}>
      The link may be broken or the item may have been archived.
    </EmptyState>
  );
}

/** Application routes. */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="time" element={<TimePage />} />
        <Route path="people" element={<RequireRole roles={['admin', 'manager']}><PeoplePage /></RequireRole>} />
        <Route path="archive" element={<RequireRole roles={['admin']}><ArchivePage /></RequireRole>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
