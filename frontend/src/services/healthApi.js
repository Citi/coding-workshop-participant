// Database wake-up. The AWS database (Aurora Serverless v2) scales to zero when idle and the first
// request afterwards takes 15-20 s, so the login page pings the public GET /health/db (which touches
// the database) while the user is still typing.
import { API_BASE_URL } from '../config'

/** Calls within this window reuse the previous ping (React StrictMode mounts pages twice in dev). */
export const WARM_UP_INTERVAL_MS = 60 * 1000

let lastPing = null // { startedAt, result }

async function pingDatabase() {
  try {
    // Plain fetch on purpose: no Authorization header (no CORS preflight) and no session-expired
    // handling, which the shared client would trigger on a 401.
    const response = await fetch(`${API_BASE_URL}/health/db`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Fire-and-forget: start waking the database. Never throws or rejects; resolves to true when the API
 * reported the database as reachable, false otherwise. Repeat calls within 60 s send no new request
 * and return the earlier result.
 */
export function warmUp() {
  const now = Date.now()
  if (lastPing && now - lastPing.startedAt < WARM_UP_INTERVAL_MS) return lastPing.result
  lastPing = { startedAt: now, result: pingDatabase() }
  return lastPing.result
}
