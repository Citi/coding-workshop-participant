/**
 * Thin fetch wrapper for the Project Tracker API.
 *
 * - Prefixes every path with `${VITE_API_URL}/api/tracker`.
 * - Attaches the bearer token and transparently refreshes it once on 401.
 * - Normalizes failures into ApiError with `status`, `message` and field `details`.
 */

const STORAGE_KEY = 'tracker.session';

/** Base URL: CloudFront origin in AWS, the CORS proxy (port 3001) locally. */
export const API_BASE = `${(import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')}/api/tracker`;

/** Error thrown for any non-2xx response or network failure. */
export class ApiError extends Error {
  /**
   * @param {string} message Human-readable message.
   * @param {number} status HTTP status (0 for network errors).
   * @param {object} [details] Field-level validation messages.
   */
  constructor(message, status, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Read the persisted session (tokens + user).
 * @returns {{access_token: string, refresh_token: string, user: object}|null}
 */
export function loadSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persist or clear the session.
 * @param {object|null} session
 */
export function saveSession(session) {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode) - session lives in memory only */
  }
}

let onSessionExpired = () => {};

/**
 * Register a callback invoked when refresh fails and the user must sign in again.
 * @param {Function} callback
 */
export function setSessionExpiredHandler(callback) {
  onSessionExpired = callback;
}

let refreshPromise = null;

async function refreshTokens() {
  const session = loadSession();
  if (!session?.refresh_token) return null;
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        saveSession(data);
        return data;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function parseBody(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

/**
 * Perform an API request.
 * @param {string} path Path relative to the tracker API, e.g. `/projects`.
 * @param {{method?: string, body?: object, query?: object, auth?: boolean}} [options]
 * @returns {Promise<any>} Parsed JSON body (null for 204).
 */
export async function request(path, { method = 'GET', body, query, auth = true } = {}) {
  const qs = query
    ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()}`
    : '';
  const url = `${API_BASE}${path}${qs === '?' ? '' : qs}`;

  const send = (token) => fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let res;
  try {
    res = await send(loadSession()?.access_token);
    if (res.status === 401 && auth) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        res = await send(refreshed.access_token);
      } else {
        saveSession(null);
        onSessionExpired();
      }
    }
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  const data = await parseBody(res);
  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(err.message || `Request failed (${res.status}).`, res.status, err.details || {});
  }
  return data;
}

/** Convenience verbs. */
export const api = {
  get: (path, query) => request(path, { query }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};
