import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL } from '../config'
import { jsonResponse } from '../test/renderWithProviders'
import { tokenStorage } from './tokenStorage'

const SESSION = { accessToken: 'access-1', refreshToken: 'refresh-1', user: { id: 1 } }
const HEALTHY = { status: 'ok', service: 'pm-service', database: 'ok' }

describe('healthApi.warmUp', () => {
  let fetchMock
  let warmUp
  let WARM_UP_INTERVAL_MS

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-24T22:00:00Z'))
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, HEALTHY))
    vi.stubGlobal('fetch', fetchMock)
    // A fresh module per test, so every test starts outside the 60 s "recently pinged" window.
    vi.resetModules()
    ;({ warmUp, WARM_UP_INTERVAL_MS } = await import('./healthApi'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('pings the public GET /health/db without the access token', async () => {
    tokenStorage.save(SESSION)
    await expect(warmUp()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/health/db`)
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ Accept: 'application/json' })
    expect(init.cache).toBe('no-store')
  })

  it('never rejects: network errors and error responses resolve to false', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(warmUp()).resolves.toBe(false)

    vi.advanceTimersByTime(WARM_UP_INTERVAL_MS)
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } }))
    await expect(warmUp()).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never throws, even when fetch itself throws synchronously', async () => {
    fetchMock.mockImplementationOnce(() => {
      throw new Error('fetch is broken')
    })
    let result
    expect(() => {
      result = warmUp()
    }).not.toThrow()
    await expect(result).resolves.toBe(false)
  })

  it('does not end the session when the API answers 401', async () => {
    tokenStorage.save(SESSION)
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }))
    await expect(warmUp()).resolves.toBe(false)
    expect(tokenStorage.load()).toEqual(SESSION)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('skips repeat calls within 60 seconds (StrictMode mounts twice) and pings again after that', async () => {
    const first = warmUp()
    expect(warmUp()).toBe(first)
    await first

    vi.advanceTimersByTime(WARM_UP_INTERVAL_MS - 1)
    await expect(warmUp()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    await warmUp()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(WARM_UP_INTERVAL_MS).toBe(60000)
  })
})
