import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';
import {
  loadSession, request, saveSession, setSessionExpiredHandler,
} from './api';

const AuthContext = createContext(null);

/**
 * Provides the signed-in user and login/logout actions to the app.
 * @param {{children: React.ReactNode}} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadSession()?.user || null);

  const logout = useCallback(() => {
    saveSession(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(logout);
  }, [logout]);

  // Refresh the profile on load so role changes made by an admin take effect.
  useEffect(() => {
    if (!loadSession()) return;
    request('/auth/me')
      .then((me) => {
        const session = loadSession();
        if (session) saveSession({ ...session, user: me });
        setUser(me);
      })
      .catch(() => {});
  }, []);

  const login = useCallback(async (username, password) => {
    const session = await request('/auth/login', {
      method: 'POST', body: { username, password }, auth: false,
    });
    saveSession(session);
    setUser(session.user);
    return session.user;
  }, []);

  const value = useMemo(() => ({
    user,
    login,
    logout,
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager',
    isEmployee: user?.role === 'employee',
  }), [user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * Access the auth context.
 * @returns {{user: object|null, login: Function, logout: Function, isAdmin: boolean, isManager: boolean, isEmployee: boolean}}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
