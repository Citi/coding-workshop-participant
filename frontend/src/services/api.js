import axios from 'axios';
import { STORAGE_KEYS } from '../utils/constants';

/**
 * The HTTP layer every service module is built on.
 *
 * The backend is six Lambdas, each reachable at {API_ROOT}/api/{service}:
 *   - locally  API_ROOT is the proxy in bin/proxy-server.js on :3001, which
 *     strips the /api/{service} prefix and forwards to the Function URL
 *   - deployed API_ROOT is the CloudFront domain, which routes /api/{service}*
 *     to the same Lambdas with the prefix intact
 *
 * Each service's router normalises both forms, so a service module declares
 * its paths once and they work in either environment.
 *
 * Never call a Lambda Function URL directly from the browser: LocalStack
 * answers 403 to any request carrying an Origin header, which is exactly why
 * the local proxy exists.
 */

const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

export const API_BASE = `${API_ROOT}/api`;

/** Requests that hang longer than this are treated as network failures. */
const REQUEST_TIMEOUT_MS = 30000;

// --------------------------------------------------------------------------
// Token storage
//
// Kept outside React so the interceptors can read and rotate tokens without
// importing AuthContext, which would be circular:
// AuthContext -> authService -> api -> AuthContext.
// --------------------------------------------------------------------------

export const tokenStore = {
  getAccess: () => localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
  getRefresh: () => localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),

  set: ({ accessToken, refreshToken }) => {
    if (accessToken) localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    if (refreshToken) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  },

  clear: () => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  },
};

/**
 * Fired when the session cannot be recovered. AuthContext listens and clears
 * the user, which sends the router back to /login.
 */
export const SESSION_EXPIRED_EVENT = 'pm:session-expired';

function notifySessionExpired() {
  tokenStore.clear();
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

// --------------------------------------------------------------------------
// Error normalisation
// --------------------------------------------------------------------------

/**
 * A predictable error shape for the UI.
 *
 * `fieldErrors` mirrors the backend's per-field validation messages so forms
 * can show them inline instead of as one banner at the top.
 */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'unknown', fieldErrors = {}, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.cause = cause;
  }

  /** True for the cases a retry might plausibly fix. */
  get isRetryable() {
    return this.status === 0 || this.status >= 500;
  }
}

const STATUS_MESSAGES = {
  400: 'Some of the details are invalid. Check the highlighted fields.',
  401: 'Your session has expired. Please sign in again.',
  403: 'Your role does not permit that action.',
  404: 'We could not find what you were looking for.',
  409: 'That conflicts with an existing record.',
  500: 'Something went wrong on our side. Please try again.',
};

function toApiError(error) {
  // No response at all: offline, DNS failure, CORS, or timeout.
  if (!error.response) {
    const timedOut = error.code === 'ECONNABORTED';
    return new ApiError(
      timedOut
        ? 'The server took too long to respond. Please try again.'
        : 'Cannot reach the API. Is the backend running?',
      { status: 0, code: timedOut ? 'timeout' : 'network', cause: error },
    );
  }

  const { status, data } = error.response;
  const body = data && typeof data === 'object' ? data : {};

  return new ApiError(
    body.message || body.error || STATUS_MESSAGES[status] || 'Unexpected error.',
    {
      status,
      code: body.code || `http_${status}`,
      fieldErrors: body.fieldErrors || {},
      cause: error,
    },
  );
}

// --------------------------------------------------------------------------
// Refresh
// --------------------------------------------------------------------------

/**
 * Single-flight refresh.
 *
 * If several requests 401 at once we must not fire several refreshes -- the
 * later ones would present an already-rotated token and fail. They all await
 * the same promise instead.
 */
let refreshInFlight = null;

function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) {
    return Promise.reject(new ApiError('No refresh token', { status: 401 }));
  }

  refreshInFlight = axios
    .post(
      `${API_BASE}/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' }, timeout: REQUEST_TIMEOUT_MS },
    )
    .then(({ data }) => {
      tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data.accessToken;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

// --------------------------------------------------------------------------
// Instance factory
// --------------------------------------------------------------------------

/**
 * Builds the axios instance for one backend service.
 *
 * @param {'auth'|'projects'|'deliverables'|'resources'|'budgets'|'reports'} service
 *   folder name under backend/
 */
export function createServiceClient(service) {
  const instance = axios.create({
    baseURL: `${API_BASE}/${service}`,
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  });

  instance.interceptors.request.use((config) => {
    const token = tokenStore.getAccess();
    if (token && !config.skipAuth) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const request = error.config;
      const status = error.response?.status;

      const canRetry =
        status === 401 &&
        request &&
        !request._retried &&
        !request.skipAuth &&
        // A 401 from login or refresh itself is terminal, not a trigger.
        !request.url?.includes('/refresh') &&
        !request.url?.includes('/login');

      if (canRetry) {
        request._retried = true;
        try {
          const accessToken = await refreshAccessToken();
          request.headers.Authorization = `Bearer ${accessToken}`;
          return instance(request);
        } catch {
          notifySessionExpired();
          return Promise.reject(
            new ApiError('Your session has expired. Please sign in again.', {
              status: 401,
              code: 'session_expired',
            }),
          );
        }
      }

      if (status === 401 && !request?.url?.includes('/login')) {
        notifySessionExpired();
      }

      return Promise.reject(toApiError(error));
    },
  );

  return instance;
}

/** Unwraps `response.data` so callers get the payload, not the axios envelope. */
export const unwrap = (promise) => promise.then((response) => response.data);
