import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import { makeAuthValue, makeUser, renderWithProviders } from '../test/utils.jsx';

function LoginProbe() {
  const location = useLocation();
  const from = location.state?.from;
  return (
    <p>
      Login page; return to {from ? `${from.pathname}${from.search}` : 'nowhere'}
      {location.state?.reason ? ` (${location.state.reason})` : ''}
    </p>
  );
}

function renderRoutes({ route, auth }) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginProbe />} />
      <Route
        path="/secret"
        element={
          <ProtectedRoute>
            <p>Secret content</p>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute roles={['ADMIN', 'PM']}>
            <p>Audit content</p>
          </ProtectedRoute>
        }
      />
      <Route element={<ProtectedRoute roles={['ADMIN']} />}>
        <Route path="/users" element={<p>Users content</p>} />
      </Route>
    </Routes>,
    { route, auth },
  );
}

describe('ProtectedRoute', () => {
  it('redirects a signed-out visitor to /login and remembers the target page', () => {
    renderRoutes({ route: '/secret?tab=risk', auth: makeAuthValue({ user: null }) });

    expect(screen.getByText('Login page; return to /secret?tab=risk')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('renders the protected content for a signed-in user', () => {
    renderRoutes({ route: '/secret', auth: makeAuthValue({ user: makeUser('VIEWER') }) });

    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });

  it('shows a loading state while the session is being checked', () => {
    renderRoutes({ route: '/secret', auth: makeAuthValue({ user: null, initializing: true }) });

    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    expect(screen.queryByText(/Login page/)).not.toBeInTheDocument();
  });

  it.each(['ADMIN', 'PM'])('lets %s open a route limited to ADMIN and PM', (role) => {
    renderRoutes({ route: '/audit', auth: makeAuthValue({ user: makeUser(role) }) });

    expect(screen.getByText('Audit content')).toBeInTheDocument();
  });

  it.each(['LEAD', 'VIEWER'])('shows access denied to %s on a route limited to ADMIN and PM', (role) => {
    renderRoutes({ route: '/audit', auth: makeAuthValue({ user: makeUser(role) }) });

    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.getByText(/available to Admin and Manager roles only/)).toBeInTheDocument();
    expect(screen.queryByText('Audit content')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the dashboard' })).toHaveAttribute('href', '/');
  });

  it('guards nested routes through <Outlet /> when used as a layout route', () => {
    const { unmount } = renderRoutes({ route: '/users', auth: makeAuthValue({ user: makeUser('ADMIN') }) });
    expect(screen.getByText('Users content')).toBeInTheDocument();
    unmount();

    renderRoutes({ route: '/users', auth: makeAuthValue({ user: makeUser('PM') }) });
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByText('Users content')).not.toBeInTheDocument();
  });

  it('passes the expiry reason to /login after a session expired', () => {
    renderRoutes({ route: '/secret', auth: makeAuthValue({ user: null, signOutReason: 'expired' }) });

    expect(screen.getByText('Login page; return to /secret (expired)')).toBeInTheDocument();
  });

  it('forgets the target page after an explicit log out', () => {
    renderRoutes({ route: '/secret', auth: makeAuthValue({ user: null, signOutReason: 'logout' }) });

    expect(screen.getByText('Login page; return to nowhere')).toBeInTheDocument();
  });

  it('still redirects to /login before checking roles', () => {
    renderRoutes({ route: '/audit', auth: makeAuthValue({ user: null }) });

    expect(screen.getByText('Login page; return to /audit')).toBeInTheDocument();
  });
});
