import { describe, expect, it, vi } from 'vitest'

import { api, ApiError, onUnauthorized, toApiError } from './apiClient'
import { storeSession } from './session'

const session = (userId = 7) => ({ token: 'aaa.bbb.ccc', user: { user_id: userId, role: 'employee' } })

function mockFetch(status, body) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('requests', () => {
  it('calls the relative /api/core URL and returns parsed JSON', async () => {
    const fetchMock = mockFetch(200, [{ building_id: 1 }])

    await expect(api.get('/buildings')).resolves.toEqual([{ building_id: 1 }])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/core/buildings')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('sends JSON bodies with a Content-Type', async () => {
    const fetchMock = mockFetch(201, { user_id: 1 })

    await api.post('/auth/register', { email: 'jane@acme.inc' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ email: 'jane@acme.inc' })
  })

  it('sends PUT bodies the same way', async () => {
    const fetchMock = mockFetch(200, { ticket_id: 5 })

    await expect(api.put('/admin/tickets/5/assignment', { engineer_id: 4 })).resolves.toEqual({ ticket_id: 5 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/core/admin/tickets/5/assignment')
    expect(init.method).toBe('PUT')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ engineer_id: 4 })
  })

  it('adds query params, skipping empty values', async () => {
    const fetchMock = mockFetch(200, [])

    await api.get('/tickets', { params: { view: 'active', q: 'wi fi', status: '', building_id: null } })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/core/tickets?view=active&q=wi+fi')
  })

  it('sends the token as a Bearer header only when signed in', async () => {
    const fetchMock = mockFetch(200, {})

    await api.get('/auth/me')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()

    storeSession(session())
    await api.get('/auth/me')
    const headers = fetchMock.mock.calls[1][1].headers
    expect(headers.Authorization).toBe('Bearer aaa.bbb.ccc')
    expect(headers).not.toHaveProperty('X-User-Id')
  })

  it('sends PATCH bodies the same way', async () => {
    const fetchMock = mockFetch(200, { seat_id: 3 })

    await expect(api.patch('/admin/seats/3', { is_active: false })).resolves.toEqual({ seat_id: 3 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/core/admin/seats/3')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ is_active: false })
  })

  it('sends DELETE without a body', async () => {
    const fetchMock = mockFetch(204)

    await expect(api.delete('/admin/seats/3')).resolves.toBeNull()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/core/admin/seats/3')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('returns null for 204 No Content', async () => {
    mockFetch(204)
    await expect(api.get('/anything')).resolves.toBeNull()
  })
})

describe('errors', () => {
  it('uses the service message from {"detail": "..."}', async () => {
    mockFetch(409, { detail: 'An account with this email already exists' })

    const error = await api.post('/auth/register', {}).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
    expect(error.message).toBe('An account with this email already exists')
  })

  it('maps 422 validation issues to fields, without the "Value error, " prefix', () => {
    const error = toApiError(422, {
      detail: [
        { loc: ['body', 'email'], msg: 'Value error, Email must be an @acme.inc address' },
        { loc: ['body', 'password'], msg: 'String should have at least 8 characters' },
        { loc: ['body', 'password'], msg: 'a second password issue is ignored' },
      ],
    })

    expect(error.fieldErrors).toEqual({
      email: 'Email must be an @acme.inc address',
      password: 'String should have at least 8 characters',
    })
    expect(error.message).toBe('Please fix the highlighted fields.')
  })

  it('uses whole-body 422 issues as the main message', () => {
    const error = toApiError(422, {
      detail: [{ loc: ['body'], msg: 'Value error, Floor-wide issues need a floor_id' }],
    })

    expect(error.message).toBe('Floor-wide issues need a floor_id')
    expect(error.fieldErrors).toEqual({})
  })

  it('hides server error details behind a friendly message', () => {
    const error = toApiError(500, { detail: 'Internal server error' })
    expect(error.message).toBe('Something went wrong on our side. Please try again.')
  })

  it('falls back to a status message when the body is not JSON', async () => {
    mockFetch(404)
    const error = await api.get('/missing').catch((e) => e)
    expect(error.message).toBe("We couldn't find what you were looking for.")
  })

  it('uses a generic message for unexpected statuses', () => {
    expect(toApiError(418, null).message).toBe('Request failed.')
  })

  it('reports network failures as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await api.get('/health').catch((e) => e)

    expect(error.status).toBe(0)
    expect(error.message).toBe("Can't reach the server. Check your connection and try again.")
  })

  it('reports a rejected session, but not a 401 without one', async () => {
    const handler = vi.fn()
    const stop = onUnauthorized(handler)
    mockFetch(401, { detail: 'Invalid email or password' })

    await api.post('/auth/login', {}).catch(() => {})
    expect(handler).not.toHaveBeenCalled()

    storeSession(session(99))
    await api.get('/auth/me').catch(() => {})
    expect(handler).toHaveBeenCalledTimes(1)

    stop()
    await api.get('/auth/me').catch(() => {})
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('keeps a newer handler when an older one unregisters', async () => {
    const older = vi.fn()
    const newer = vi.fn()
    const stopOlder = onUnauthorized(older)
    const stopNewer = onUnauthorized(newer)
    stopOlder()
    storeSession(session(99))
    mockFetch(401, {})

    await api.get('/auth/me').catch(() => {})

    expect(newer).toHaveBeenCalledTimes(1)
    expect(older).not.toHaveBeenCalled()
    stopNewer()
  })

  it('lets cancelled requests reject as AbortError', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))

    await expect(api.get('/tickets')).rejects.toBe(abort)
  })
})
