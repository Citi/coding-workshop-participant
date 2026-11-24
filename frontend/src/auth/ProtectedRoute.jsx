import PropTypes from 'prop-types';
import { Link as RouterLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EmptyState from '../components/EmptyState.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { ROLES, ROLE_LABELS } from '../constants.js';
import { useAuth } from './useAuth.js';

/**
 * Guards a route. Signed-out visitors go to /login, which returns them to the page they
 * asked for after signing in (and says so when the session expired). After an explicit
 * log out the target is not kept. With `roles`, other roles see an access-denied message.
 * Renders `children` when given, otherwise the nested route (`<Outlet />`).
 * @param {object} props - Component props.
 * @param {string[]} [props.roles] - Roles allowed to open the route; any signed-in user when omitted.
 * @param {import('react').ReactNode} [props.children] - Content to protect.
 * @returns {JSX.Element} The protected content, a redirect or an access-denied message.
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, initializing, signOutReason } = useAuth();
  const location = useLocation();

  if (initializing) {
    return <LoadingState message="Checking your session…" fullPage />;
  }
  if (!user) {
    if (signOutReason === 'logout') {
      return <Navigate to="/login" replace />;
    }
    const state = signOutReason === 'expired' ? { from: location, reason: 'expired' } : { from: location };
    return <Navigate to="/login" replace state={state} />;
  }
  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) {
    const allowed = roles.map((role) => ROLE_LABELS[role] ?? role).join(' and ');
    return (
      <Box role="alert">
        <EmptyState
          icon={<LockOutlinedIcon />}
          title="Access denied"
          message={`This page is available to ${allowed} roles only. You are signed in as ${
            ROLE_LABELS[user.role] ?? user.role
          }.`}
          action={
            <Button component={RouterLink} to="/" variant="outlined">
              Go to the dashboard
            </Button>
          }
        />
      </Box>
    );
  }
  return children ?? <Outlet />;
}

ProtectedRoute.propTypes = {
  roles: PropTypes.arrayOf(PropTypes.oneOf(ROLES)),
  children: PropTypes.node,
};
