import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import theme from '../theme';
import { AuthProvider } from '../services/AuthContext';
import { NotifyProvider } from '../services/NotifyContext';

/** Store a fake session so AuthProvider starts signed in as `user`. */
export function signInAs(user) {
  window.localStorage.setItem('tracker.session', JSON.stringify({ access_token: 'a', refresh_token: 'r', user }));
}

export const users = {
  admin: { id: 1, name: 'Alex Morgan', role: 'admin', username: 'admin' },
  manager: { id: 2, name: 'Maria Lopez', role: 'manager', username: 'mlopez' },
  employee: { id: 4, name: 'Aisha Patel', role: 'employee', username: 'apatel', manager_id: 2 },
};

/** Render with theme, router, notifications and auth. */
export function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[route]}>
        <NotifyProvider>
          <AuthProvider>{ui}</AuthProvider>
        </NotifyProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

/** Build a fetch Response-like object. */
export function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
  };
}

/**
 * Mock global fetch with a route table: { 'GET /projects': body | (url, init) => [status, body] }.
 * Returns the vi spy so tests can inspect calls.
 */
export function mockApi(vi, routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const method = init.method || 'GET';
    const path = new URL(url).pathname.replace(/^\/api\/tracker/, '');
    const handler = routes[`${method} ${path}`];
    if (handler === undefined) return jsonResponse(404, { error: { message: `No mock for ${method} ${path}` } });
    if (typeof handler === 'function') {
      const [status, body] = handler(url, init);
      return jsonResponse(status, body);
    }
    return jsonResponse(200, handler);
  });
}
