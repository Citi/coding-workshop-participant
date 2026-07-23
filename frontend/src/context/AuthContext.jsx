import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';
import { SESSION_EXPIRED_EVENT, tokenStore } from '../services/api';
import { ROLES, STORAGE_KEYS } from '../utils/constants';
import { can, canAny, scopeOf } from '../utils/permissions';

/**
 * Holds the signed-in user for the whole app.
 *
 * Exported separately from the provider so `useAuth` can consume it without
 * importing the component tree.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext(null);

/**
 * Reads the user cached at login.
 *
 * A rendering optimisation only: it lets the shell paint the user's name
 * immediately instead of flashing a skeleton while /auth/me resolves. The
 * token remains the only thing that grants access, and the server the only
 * thing that validates it.
 */
function readCachedUser() {
  // No token means no session, whatever the cache says.
  if (!tokenStore.getAccess()) return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Corrupt entry -- drop it rather than crashing the app on boot.
    localStorage.removeItem(STORAGE_KEYS.USER);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readCachedUser);

  /**
   * True only while the initial "do we have a valid session?" check runs.
   * The route guards wait on it, otherwise a page refresh would bounce a
   * signed-in user to /login before the token had been verified.
   */
  const [initialising, setInitialising] = useState(() => Boolean(tokenStore.getAccess()));

  const applyUser = useCallback((nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(nextUser));
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  }, []);

  // Verify the stored token against the server exactly once, on mount.
  useEffect(() => {
    let cancelled = false;

    // Nothing to verify, and `initialising` was already seeded false.
    if (!tokenStore.getAccess()) return undefined;

    authService
      .me()
      .then((fresh) => {
        if (!cancelled) applyUser(fresh);
      })
      .catch(() => {
        // The interceptor already tried to refresh and cleared the tokens.
        if (!cancelled) applyUser(null);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyUser]);

  /**
   * The axios interceptor fires this when a refresh fails, which can happen
   * long after mount. Listening here keeps sign-out centralised: any 401 the
   * client cannot recover from clears the user exactly once.
   */
  useEffect(() => {
    const onExpired = () => applyUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [applyUser]);

  const login = useCallback(
    async (credentials) => {
      const signedIn = await authService.login(credentials);
      applyUser(signedIn);
      return signedIn;
    },
    [applyUser],
  );

  const register = useCallback(
    async (details) => {
      const created = await authService.register(details);
      if (tokenStore.getAccess()) applyUser(created);
      return created;
    },
    [applyUser],
  );

  const logout = useCallback(async () => {
    await authService.logout();
    applyUser(null);
  }, [applyUser]);

  const value = useMemo(() => {
    const role = user?.role ?? null;

    return {
      user,
      role,
      isAuthenticated: Boolean(user),
      isAdmin: role === ROLES.ADMIN,
      initialising,
      login,
      register,
      logout,

      /** Whether the current role may perform `action` at all. */
      can: (action) => can(role, action),

      /** Whether the current role holds any of the given actions. */
      canAny: (...actions) => canAny(role, ...actions),

      /** 'assigned' | 'team' | 'own' | null -- how widely `action` applies. */
      scopeOf: (action) => scopeOf(role, action),

      /** True when the user's role is any of those passed in. */
      hasRole: (...roles) => Boolean(role && roles.flat().includes(role)),
    };
  }, [user, initialising, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
