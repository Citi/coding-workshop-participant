import { useEffect } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import { useAuth } from './useAuth.js';
import { getAccessToken, getStoredUser, setStoredUser, setTokens } from './tokenStorage.js';
import { API_BASE_URL } from '../services/apiClient.js';
import { listProjects } from '../services/projects.js';
import { jsonResponse, makeUser, renderWithProviders } from '../test/utils.jsx';

let fetchMock;
const captured = { auth: null };

function Probe() {
  const auth = useAuth();
  useEffect(() => {
    captured.auth = auth;
  });
  return (
    <p>
      {auth.initializing ? 'initializing' : `user=${auth.user ? `${auth.user.name}/${auth.role}` : 'none'}`}
    </p>
  );
}

function LoginProbe() {
  const location = useLocation();
  return (
    <p>
      login page from={location.state?.from?.pathname ?? '-'} reason={location.state?.reason ?? '-'}
    </p>
  );
}

function renderAuth(route = '/projects') {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginProbe />} />
      <Route path="/open" element={<Probe />} />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <Probe />
          </ProtectedRoute>
        }
      />
    </Routes>,
    { route, realAuth: true },
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  captured.auth = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthProvider', () => {
  it('starts signed out without calling the API when there is no token', () => {
    renderAuth('/open');

    expect(screen.getByText('user=none')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(captured.auth.can('read', 'projects')).toBe(false);
  });

  it('restores a stored session at once and refreshes the profile from /auth/me', async () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    setStoredUser(makeUser('LEAD'));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, makeUser('PM')));

    renderAuth();

    expect(screen.getByText('user=Vikram Shah/LEAD')).toBeInTheDocument();
    expect(await screen.findByText('user=Vikram Shah/PM')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/auth/me`);
    expect(getStoredUser().role).toBe('PM');
    // captured.auth is stored in a passive effect, which can run just after the text appears.
    await waitFor(() => {
      expect(captured.auth.can('create', 'projects')).toBe(true);
      expect(captured.auth.isAuthenticated).toBe(true);
    });
  });

  it('waits for /auth/me when a token exists without a cached profile', async () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, makeUser('VIEWER')));

    renderAuth('/open');

    expect(screen.getByText('initializing')).toBeInTheDocument();
    expect(await screen.findByText('user=Vikram Shah/VIEWER')).toBeInTheDocument();
  });

  it('keeps the restored session when the server cannot be reached', async () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    setStoredUser(makeUser('PM'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    renderAuth();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    vi.useRealTimers();

    expect(screen.getByText('user=Vikram Shah/PM')).toBeInTheDocument();
    expect(getAccessToken()).toBe('access-1');
  });

  it('signs out and sends the user to /login, remembering the page, when refresh fails', async () => {
    setTokens({ accessToken: 'stale', refreshToken: 'expired' });
    setStoredUser(makeUser('PM'));
    fetchMock.mockImplementation(async () => jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Expired.' }));

    renderAuth('/projects');

    expect(await screen.findByText('login page from=/projects reason=expired')).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it('logs out on request and returns to /login', async () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    setStoredUser(makeUser('ADMIN'));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, makeUser('ADMIN')));
    renderAuth('/users');
    await screen.findByText('user=Vikram Shah/ADMIN');

    act(() => captured.auth.logout());

    expect(await screen.findByText('login page from=- reason=-')).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('exposes refresh and reloadUser', async () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    setStoredUser(makeUser('VIEWER'));
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, makeUser('VIEWER')))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'access-2' }))
      .mockResolvedValueOnce(jsonResponse(200, makeUser('ADMIN')));
    renderAuth();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    let refreshed;
    await act(async () => {
      refreshed = await captured.auth.refresh();
    });
    expect(refreshed).toBe(true);
    expect(getAccessToken()).toBe('access-2');

    await act(async () => {
      await captured.auth.reloadUser();
    });
    expect(screen.getByText('user=Vikram Shah/ADMIN')).toBeInTheDocument();
  });

  it('lets other API calls trigger the same sign-out flow', async () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    setStoredUser(makeUser('PM'));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, makeUser('PM')));
    renderAuth('/risk');
    await screen.findByText('user=Vikram Shah/PM');

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Expired.' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Expired.' }));
    await act(async () => {
      await listProjects().catch(() => null);
    });

    expect(await screen.findByText('login page from=/risk reason=expired')).toBeInTheDocument();
  });
});

describe('useAuth', () => {
  it('throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderWithProviders(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>.');
    spy.mockRestore();
  });
});

describe('AuthProvider races', () => {
  it('ignores a late /auth/me answer after the user logged out', async () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    setStoredUser(makeUser('PM'));
    let answer;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    renderAuth('/open');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => captured.auth.logout());
    await act(async () => answer(jsonResponse(200, makeUser('ADMIN'))));

    expect(captured.auth.user).toBeNull();
    expect(getStoredUser()).toBeNull();
  });
});
