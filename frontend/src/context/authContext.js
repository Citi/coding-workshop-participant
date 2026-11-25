// Auth state shared by the whole app. Provided by <AuthProvider>; read with useAuth().
import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/**
 * { user, isAuthenticated, login(email, password), logout(), can(permission),
 *   sessionMessage, clearSessionMessage() }
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
