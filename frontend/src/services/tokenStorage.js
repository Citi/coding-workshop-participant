// Persists the login session ({ accessToken, refreshToken, user }) across page reloads.
const STORAGE_KEY = 'acme-pm-session'

export const tokenStorage = {
  load() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || null
    } catch {
      return null
    }
  },
  save(session) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  },
  clear() {
    window.localStorage.removeItem(STORAGE_KEY)
  },
}
