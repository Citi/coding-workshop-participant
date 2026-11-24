/**
 * Test helpers: provider wrappers, a fake auth value and fetch response builders.
 */
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { Context as ResponsiveContext } from 'react-responsive';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { AuthContext } from '../auth/context.js';
import { can } from '../auth/permissions.js';
import NotificationProvider from '../notifications/NotificationProvider.jsx';
import theme from '../theme.js';

/** Phone-sized viewport width for mobile layout tests. */
export const PHONE_WIDTH = 375;

/**
 * Build a stand-in auth context value.
 * @param {object} [overrides] - Fields to override, usually `user`.
 * @returns {object} Auth context value.
 */
export function makeAuthValue(overrides = {}) {
  const user = overrides.user ?? null;
  return {
    user,
    role: user?.role ?? null,
    isAuthenticated: Boolean(user),
    initializing: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    reloadUser: vi.fn(),
    can: (action, resource) => can(user?.role, action, resource),
    ...overrides,
  };
}

/**
 * A user as `/auth/me` returns it.
 * @param {string} role - ADMIN, PM, LEAD or VIEWER.
 * @returns {object} UserOut.
 */
export function makeUser(role = 'PM') {
  return {
    id: 2,
    name: 'Vikram Shah',
    email: 'pm@acme.example',
    role,
    department_id: 1,
    department_name: 'Engineering',
    created_at: '2026-11-01T09:00:00Z',
  };
}

/**
 * Render inside theme, router, notifications and either a fake or the real auth provider.
 * The snackbar replaces a message as soon as another is queued (`minVisibleMs={0}`), so a
 * test that triggers two messages can find the second one within the default timeout.
 * @param {import('react').ReactElement} ui - Element to render.
 * @param {object} [options] - Options.
 * @param {string} [options.route] - Initial URL.
 * @param {object} [options.routeState] - Initial location state.
 * @param {number} [options.width] - Viewport width for react-responsive (e.g. PHONE_WIDTH).
 * @param {object} [options.auth] - Fake auth value (see makeAuthValue).
 * @param {boolean} [options.realAuth] - Use the real AuthProvider instead of a fake value.
 * @returns {object} RTL render result plus `user` (userEvent instance).
 */
export function renderWithProviders(ui, { route = '/', routeState, width, auth, realAuth = false } = {}) {
  function Wrapper({ children }) {
    let content = children;
    if (realAuth) {
      content = <AuthProvider>{content}</AuthProvider>;
    } else if (auth) {
      content = <AuthContext.Provider value={auth}>{content}</AuthContext.Provider>;
    }
    return (
      <ResponsiveContext.Provider value={width ? { width } : undefined}>
        <ThemeProvider theme={theme}>
          <MemoryRouter initialEntries={[{ pathname: route.split('?')[0], search: route.includes('?') ? `?${route.split('?')[1]}` : '', state: routeState }]}>
            <NotificationProvider minVisibleMs={0}>{content}</NotificationProvider>
          </MemoryRouter>
        </ThemeProvider>
      </ResponsiveContext.Provider>
    );
  }
  return { user: userEvent.setup(), ...render(ui, { wrapper: Wrapper }) };
}

/**
 * Build a JSON fetch Response.
 * @param {number} status - HTTP status.
 * @param {unknown} [body] - JSON body; omitted for an empty body.
 * @param {Record<string, string>} [headers] - Extra headers.
 * @returns {Response} The response.
 */
export function jsonResponse(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * Build an HTML fetch Response, like CloudFront's SPA fallback.
 * @param {number} [status] - HTTP status (CloudFront rewrites 404 to 200).
 * @returns {Response} The response.
 */
export function htmlResponse(status = 200) {
  return new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
