// HTTP client for pm-service: JSON in/out, Bearer token, one silent token refresh on expiry,
// and a single error type (ApiError) carrying the backend's { code, message, details }.
import { API_BASE_URL } from '../config'
import { tokenStorage } from './tokenStorage'

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details || {}
  }
}

const sessionListeners = new Set()
let refreshInFlight = null

/** Subscribe to "session ended" events (expired/invalid token). Returns an unsubscribe function. */
export function onSessionExpired(listener) {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}

function endSession(message) {
  tokenStorage.clear()
  sessionListeners.forEach((listener) => listener(message))
}

export function buildUrl(path, query) {
  const params = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value))
  })
  const queryString = params.toString()
  return `${API_BASE_URL}${path}${queryString ? `?${queryString}` : ''}`
}

async function readBody(response) {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError({
      status: response.status,
      code: 'INVALID_RESPONSE',
      message: 'The server returned an unexpected response. Please try again.',
    })
  }
}

async function send(method, path, { body, query, auth = true, token } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const accessToken = token ?? tokenStorage.load()?.accessToken
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the server. Check your connection and try again.',
    })
  }

  const data = await readBody(response)
  if (!response.ok) {
    const error = data?.error || {}
    throw new ApiError({
      status: response.status,
      code: error.code || 'HTTP_ERROR',
      message: error.message || `Request failed with status ${response.status}`,
      details: error.details,
    })
  }
  return data
}

function refreshSession() {
  const session = tokenStorage.load()
  if (!session?.refreshToken) {
    return Promise.reject(
      new ApiError({ status: 401, code: 'TOKEN_EXPIRED', message: 'Your session has expired, please log in again' }),
    )
  }
  // Concurrent requests that expire together share one refresh call.
  if (!refreshInFlight) {
    refreshInFlight = send('POST', '/auth/refresh', { body: { refresh_token: session.refreshToken }, auth: false })
      .then((data) => {
        const next = { accessToken: data.access_token, refreshToken: data.refresh_token, user: data.user }
        tokenStorage.save(next)
        return next
      })
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

/** Send a request; on 401 TOKEN_EXPIRED refresh once and retry, on other 401s end the session. */
export async function request(method, path, options = {}) {
  try {
    return await send(method, path, options)
  } catch (error) {
    const isAuthFailure = error instanceof ApiError && error.status === 401 && options.auth !== false
    if (!isAuthFailure) throw error
    if (error.code === 'TOKEN_EXPIRED' && !options.retried) {
      let session
      try {
        session = await refreshSession()
      } catch (refreshError) {
        if (refreshError instanceof ApiError && refreshError.status !== 0) endSession(refreshError.message)
        throw refreshError
      }
      return request(method, path, { ...options, token: session.accessToken, retried: true })
    }
    endSession(error.message)
    throw error
  }
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  delete: (path) => request('DELETE', path),
}

/** Standard CRUD calls for a REST collection, e.g. createCrudApi('/projects'). */
export function createCrudApi(basePath) {
  return {
    list: (filters) => api.get(basePath, filters),
    get: (id) => api.get(`${basePath}/${id}`),
    create: (data) => api.post(basePath, data),
    update: (id, data) => api.put(`${basePath}/${id}`, data),
    remove: (id) => api.delete(`${basePath}/${id}`),
  }
}
