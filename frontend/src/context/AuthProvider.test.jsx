import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from '../services/apiClient'
import { authApi } from '../services/authApi'
import { tokenStorage } from '../services/tokenStorage'
import { jsonResponse } from '../test/renderWithProviders'
import { useAuth } from './authContext'
import { AuthProvider } from './AuthProvider'

vi.mock('../services/authApi', () => ({ authApi: { login: vi.fn(), me: vi.fn() } }))

const ADMIN = {
  id: 1,
  email: 'admin@acme.com',
  full_name: 'System Administrator',
  role: 'admin',
  is_active: true,
  permissions: ['dashboard:read', 'projects:read', 'projects:create'],
}
const LOGIN_RESPONSE = { access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'Bearer', expires_in: 1800, user: ADMIN }
// The same account after an admin changed its role to viewer.
const DEMOTED = { ...ADMIN, role: 'viewer', permissions: ['dashboard:read', 'projects:read'] }

const renderAuth = () => renderHook(() => useAuth(), { wrapper: AuthProvider })

describe('AuthProvider', () => {
  beforeEach(() => {
    authApi.login.mockReset()
    authApi.me.mockReset()
  })

  it('starts logged out when no session is stored, without calling /auth/me', () => {
    const { result } = renderAuth()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.can('dashboard:read')).toBe(false)
    expect(result.current.sessionMessage).toBe('')
    expect(authApi.me).not.toHaveBeenCalled()
  })

  it('logs in: keeps the tokens and exposes the user and their permissions', async () => {
    authApi.login.mockResolvedValue(LOGIN_RESPONSE)
    const { result } = renderAuth()
    let returned
    await act(async () => {
      returned = await result.current.login('admin@acme.com', 'Admin@123')
    })
    expect(authApi.login).toHaveBeenCalledWith('admin@acme.com', 'Admin@123')
    expect(returned).toEqual(ADMIN)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(ADMIN)
    expect(result.current.can('projects:create')).toBe(true)
    expect(result.current.can('users:read')).toBe(false)
    expect(tokenStorage.load()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1', user: ADMIN })
  })

  it('stays logged out and passes the error on when the login fails', async () => {
    authApi.login.mockRejectedValue(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }))
    const { result } = renderAuth()
    await act(async () => {
      await expect(result.current.login('admin@acme.com', 'wrong')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(tokenStorage.load()).toBeNull()
  })

  it('restores the stored session and refreshes the user from /auth/me (role changes apply on reload)', async () => {
    tokenStorage.save({ accessToken: 'access-1', refreshToken: 'refresh-1', user: ADMIN })
    authApi.me.mockResolvedValue(DEMOTED)
    const { result } = renderAuth()
    // The cached user is available straight away, so a reload does not flash the login page.
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(ADMIN)
    await waitFor(() => expect(result.current.user).toEqual(DEMOTED))
    expect(result.current.can('projects:create')).toBe(false)
    expect(tokenStorage.load()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1', user: DEMOTED })
  })

  it('keeps the cached user when /auth/me cannot be reached', async () => {
    tokenStorage.save({ accessToken: 'access-1', refreshToken: 'refresh-1', user: ADMIN })
    authApi.me.mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server.' }))
    const { result } = renderAuth()
    await waitFor(() => expect(authApi.me).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(ADMIN)
  })

  it('does not bring the session back when /auth/me answers after a logout', async () => {
    tokenStorage.save({ accessToken: 'access-1', refreshToken: 'refresh-1', user: ADMIN })
    let answerMe
    authApi.me.mockReturnValue(new Promise((resolve) => (answerMe = resolve)))
    const { result } = renderAuth()
    act(() => result.current.logout())
    await act(async () => answerMe(ADMIN))
    expect(result.current.isAuthenticated).toBe(false)
    expect(tokenStorage.load()).toBeNull()
  })

  it('logs out: forgets the tokens and the user', async () => {
    authApi.login.mockResolvedValue(LOGIN_RESPONSE)
    const { result } = renderAuth()
    await act(async () => {
      await result.current.login('admin@acme.com', 'Admin@123')
    })
    act(() => result.current.logout())
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.can('dashboard:read')).toBe(false)
    expect(tokenStorage.load()).toBeNull()
  })

  it('ends the session when the API rejects the token, keeping the reason for the login page', async () => {
    tokenStorage.save({ accessToken: 'access-1', refreshToken: 'refresh-1', user: ADMIN })
    authApi.me.mockResolvedValue(ADMIN)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'INVALID_TOKEN', message: 'Please log in again' } })),
    )
    const { result } = renderAuth()
    await waitFor(() => expect(authApi.me).toHaveBeenCalled())

    // Any API call (here a page loading its list) can discover that the session is over.
    await act(async () => {
      await expect(request('GET', '/projects')).rejects.toMatchObject({ status: 401 })
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.sessionMessage).toBe('Please log in again')
    expect(tokenStorage.load()).toBeNull()

    act(() => result.current.clearSessionMessage())
    expect(result.current.sessionMessage).toBe('')
  })

  it('clears the "session ended" message on the next successful login', async () => {
    authApi.login.mockResolvedValue(LOGIN_RESPONSE)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: 'ACCOUNT_DISABLED', message: 'Your account is disabled' } })),
    )
    const { result } = renderAuth()
    await act(async () => {
      await result.current.login('admin@acme.com', 'Admin@123')
    })
    await act(async () => {
      await request('GET', '/dashboard').catch(() => {})
    })
    expect(result.current.sessionMessage).toBe('Your account is disabled')
    await act(async () => {
      await result.current.login('admin@acme.com', 'Admin@123')
    })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.sessionMessage).toBe('')
  })

  it('useAuth explains the mistake when used outside <AuthProvider>', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside <AuthProvider>')
  })
})
