import { useCallback, useEffect, useMemo, useState } from 'react'
import { onSessionExpired } from '../services/apiClient'
import { authApi } from '../services/authApi'
import { tokenStorage } from '../services/tokenStorage'
import { AuthContext } from './authContext'

const EXPIRED_MESSAGE = 'Your session has expired, please log in again'

/** Holds the logged-in user; permissions come from the API (single source of truth for RBAC). */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => tokenStorage.load())
  const [sessionMessage, setSessionMessage] = useState('')

  // The API client reports expired/invalid sessions; drop back to the login page.
  useEffect(
    () =>
      onSessionExpired((message) => {
        setSession(null)
        setSessionMessage(message || EXPIRED_MESSAGE)
      }),
    [],
  )

  // On app start, refresh the stored user (role/permissions may have changed since last visit).
  useEffect(() => {
    if (!tokenStorage.load()?.accessToken) return
    authApi
      .me()
      .then((user) => {
        const current = tokenStorage.load()
        if (!current) return
        const next = { ...current, user }
        tokenStorage.save(next)
        setSession(next)
      })
      .catch(() => {
        // Expired sessions are handled by onSessionExpired; network errors keep the cached user.
      })
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password)
    const next = { accessToken: data.access_token, refreshToken: data.refresh_token, user: data.user }
    tokenStorage.save(next)
    setSession(next)
    setSessionMessage('')
    return data.user
  }, [])

  const logout = useCallback(() => {
    tokenStorage.clear()
    setSession(null)
  }, [])

  const clearSessionMessage = useCallback(() => setSessionMessage(''), [])

  const value = useMemo(() => {
    const permissions = new Set(session?.user?.permissions || [])
    return {
      user: session?.user || null,
      isAuthenticated: Boolean(session?.accessToken),
      login,
      logout,
      can: (permission) => permissions.has(permission),
      sessionMessage,
      clearSessionMessage,
    }
  }, [session, sessionMessage, login, logout, clearSessionMessage])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
