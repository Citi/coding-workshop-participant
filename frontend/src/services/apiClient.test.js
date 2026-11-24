import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../config'
import { jsonResponse } from '../test/renderWithProviders'
import { ApiError, buildUrl, createCrudApi, onSessionExpired, request } from './apiClient'
import { tokenStorage } from './tokenStorage'

describe('apiClient', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    tokenStorage.save({ accessToken: 'access-1', refreshToken: 'refresh-1', user: { id: 1 } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds URLs with only the non-empty query parameters', () => {
    expect(buildUrl('/projects', { status: 'active', search: '', health: undefined, is_key: true })).toBe(
      `${API_BASE_URL}/projects?status=active&is_key=true`,
    )
  })

  it('sends JSON with the bearer token and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 7 }))
    const result = await request('POST', '/projects', { body: { name: 'Apollo' } })
    expect(result).toEqual({ id: 7 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/projects`)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer access-1')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ name: 'Apollo' })
  })

  it('returns null for 204 No Content', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204))
    expect(await createCrudApi('/projects').remove(3)).toBeNull()
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/projects/3`)
  })

  it('turns the backend error shape into an ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: { name: 'This field is required' } } }),
    )
    const error = await request('POST', '/projects', { body: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed' })
    expect(error.details).toEqual({ name: 'This field is required' })
  })

  it('reports network failures with a friendly message', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await request('GET', '/projects').catch((e) => e)
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  it('reports non-JSON responses', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: () => Promise.resolve('<html>Bad gateway</html>') })
    const error = await request('GET', '/projects').catch((e) => e)
    expect(error.code).toBe('INVALID_RESPONSE')
  })

  it('refreshes an expired token once and retries the request', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'access-2', refresh_token: 'refresh-2', user: { id: 1 } }))
      .mockResolvedValueOnce(jsonResponse(200, { items: [], total: 0 }))
    const result = await request('GET', '/projects')
    expect(result).toEqual({ items: [], total: 0 })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refresh_token: 'refresh-1' })
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer access-2')
    expect(tokenStorage.load().accessToken).toBe('access-2')
  })

  it('ends the session when the refresh fails', async () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_TOKEN', message: 'Please log in again' } }))
    await expect(request('GET', '/projects')).rejects.toMatchObject({ status: 401 })
    expect(listener).toHaveBeenCalledWith('Please log in again')
    expect(tokenStorage.load()).toBeNull()
    unsubscribe()
  })

  it('ends the session on other 401 errors without refreshing', async () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'ACCOUNT_DISABLED', message: 'disabled' } }))
    await expect(request('GET', '/projects')).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('disabled')
    unsubscribe()
  })

  it('does not end the session for a failed login (public request)', async () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }))
    await expect(request('POST', '/auth/login', { body: {}, auth: false })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('CRUD helpers call the right method and path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    const crud = createCrudApi('/expenses')
    await crud.list({ project_id: 2 })
    await crud.get(5)
    await crud.update(5, { amount: 1 })
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      `GET ${API_BASE_URL}/expenses?project_id=2`,
      `GET ${API_BASE_URL}/expenses/5`,
      `PUT ${API_BASE_URL}/expenses/5`,
    ])
  })
})
