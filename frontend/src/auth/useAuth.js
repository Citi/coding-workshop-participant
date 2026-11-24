/**
 * Hook for reading the signed-in user and calling login, logout and refresh.
 */
import { useContext } from 'react';
import { AuthContext } from './context.js';

/**
 * Access the auth state and actions.
 * @example
 * const { user, can, logout } = useAuth();
 * {can('create', 'projects') && <Button>New project</Button>}
 * @returns {{user: object|null, role: string|null, isAuthenticated: boolean, initializing: boolean,
 *   signOutReason: 'expired'|'logout'|null,
 *   login: (email: string, password: string) => Promise<object>, logout: () => void,
 *   refresh: () => Promise<boolean>, reloadUser: () => Promise<object|null>,
 *   can: (action: string, resource: string) => boolean}} Auth state and actions.
 * @throws {Error} When used outside AuthProvider.
 */
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return value;
}

export default useAuth;
