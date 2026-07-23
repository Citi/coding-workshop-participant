import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

/**
 * Reads the current session.
 *
 * @returns {{
 *   user: object|null,
 *   role: string|null,
 *   isAuthenticated: boolean,
 *   isAdmin: boolean,
 *   initialising: boolean,
 *   login: (credentials: {email: string, password: string}) => Promise<object>,
 *   register: (details: object) => Promise<object>,
 *   logout: () => Promise<void>,
 *   can: (action: string) => boolean|string,
 *   canAny: (...actions: string[]) => boolean,
 *   scopeOf: (action: string) => 'assigned'|'team'|'own'|null,
 *   hasRole: (...roles: string[]) => boolean,
 * }}
 */
export default function useAuth() {
  const context = useContext(AuthContext);

  // Throwing beats returning undefined: the failure surfaces at the component
  // that forgot the provider, not three frames later on a null dereference.
  if (context === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }

  return context;
}
