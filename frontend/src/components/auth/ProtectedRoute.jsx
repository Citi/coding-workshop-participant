import { Box, CircularProgress } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

/**
 * Route guard. Renders nested routes only for a signed-in user, optionally
 * narrowed by role or by a required permission.
 *
 * Used as a layout route:
 *   <Route element={<ProtectedRoute />}> … </Route>
 *   <Route element={<ProtectedRoute action={ACTIONS.MANAGE_USERS} />}> … </Route>
 *
 * @param {string}   [action] permission the route requires
 * @param {string[]} [roles]  explicit role allow-list
 */
export default function ProtectedRoute({ action, roles }) {
  const { isAuthenticated, initialising, can, hasRole } = useAuth();
  const location = useLocation();

  // Waiting on the token check. Redirecting now would sign out anyone who
  // refreshed the page, because /auth/me has not resolved yet.
  if (initialising) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
        role="status"
        aria-live="polite"
      >
        <CircularProgress aria-label="Checking your session" />
      </Box>
    );
  }

  if (!isAuthenticated) {
    // `state.from` lets LoginPage send the user back where they were headed.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const permitted = (!action || Boolean(can(action))) && (!roles?.length || hasRole(roles));

  // Authenticated but not permitted: a dead end, not a login problem, so send
  // them somewhere useful rather than back to the sign-in form.
  if (!permitted) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
