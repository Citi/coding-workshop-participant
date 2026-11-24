import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './context.js';
import { can as roleCan } from './permissions.js';
import {
  clearSession,
  getAccessToken,
  getStoredUser,
  setStoredUser,
  setTokens,
} from './tokenStorage.js';
import * as authApi from '../services/auth.js';
import { refreshAccessToken, setAuthFailureHandler } from '../services/apiClient.js';

/**
 * Provides the signed-in user plus `login`, `logout`, `refresh` and `reloadUser`.
 * Tokens live in sessionStorage. On load a stored session is restored at once and checked
 * against `/auth/me` in the background, so role changes apply immediately. When the API
 * client finally fails to authenticate, the session is cleared and `signOutReason` becomes
 * 'expired'; ProtectedRoute then sends the user to /login with the page they were on and
 * the reason, so the sign-in page can explain and return them there afterwards.
 * Must be rendered inside a router.
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - The app.
 * @returns {JSX.Element} The provider.
 */
export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const [user, setUser] = useState(() => (getAccessToken() ? getStoredUser() : null));
  const [initializing, setInitializing] = useState(() => Boolean(getAccessToken()) && !getStoredUser());
  const [signOutReason, setSignOutReason] = useState(null);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    // ProtectedRoute performs the redirect: React Router runs navigations as transitions,
    // so a second navigate() here would race its <Navigate> and could lose the state.
    setAuthFailureHandler(() => {
      clearSession();
      setSignOutReason('expired');
      setUser(null);
    });
    return () => setAuthFailureHandler(null);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      return undefined;
    }
    let active = true;
    authApi
      .getMe()
      .then(
        (me) => {
          // Ignore a late answer if the user signed out while it was in flight.
          if (active && me && getAccessToken()) {
            setStoredUser(me);
            setUser(me);
          }
        },
        () => {
          // A 401 is already handled by the API client (refresh, then sign out).
          // Network errors keep the restored session so the app still opens.
        },
      )
      .finally(() => {
        if (active) {
          setInitializing(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await authApi.login(String(email).trim().toLowerCase(), password);
    setTokens({ accessToken: result.access_token, refreshToken: result.refresh_token });
    setStoredUser(result.user);
    setSignOutReason(null);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSignOutReason('logout');
    setUser(null);
    navigateRef.current('/login', { replace: true });
  }, []);

  const refresh = useCallback(() => refreshAccessToken(), []);

  const reloadUser = useCallback(async () => {
    const me = await authApi.getMe();
    setStoredUser(me);
    setUser(me);
    return me;
  }, []);

  const value = useMemo(() => {
    const role = user?.role ?? null;
    return {
      user,
      role,
      isAuthenticated: Boolean(user),
      initializing,
      signOutReason,
      login,
      logout,
      refresh,
      reloadUser,
      can: (action, resource) => roleCan(role, action, resource),
    };
  }, [user, initializing, signOutReason, login, logout, refresh, reloadUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node,
};

export default AuthProvider;
