/**
 * React context for the signed-in user and auth actions; provided by AuthProvider
 * (auth/AuthContext.jsx) and read with `useAuth`.
 */
import { createContext } from 'react';

/**
 * Value shape: `{ user, role, isAuthenticated, initializing, signOutReason, login, logout,
 * refresh, reloadUser, can }`; null outside the provider.
 */
export const AuthContext = createContext(null);
