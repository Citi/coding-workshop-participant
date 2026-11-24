/**
 * Fetch wrapper for the portfolio API (spec section 12.2).
 *
 * - Base URL: `${VITE_API_URL without trailing slash}/api/portfolio`. Locally that is the
 *   CORS proxy (http://localhost:3001); in AWS VITE_API_URL is the CloudFront origin.
 * - Sends `Authorization: Bearer <access token>` from sessionStorage.
 * - On 401: calls `/auth/refresh` once and retries; if that fails, signs out and goes to /login.
 * - 204 responses resolve to `null`.
 * - A `text/html` response is treated as 404 NOT_FOUND: CloudFront's SPA rule can replace an
 *   API 404 with index.html and status 200. An HTML 5xx page is a gateway error (CloudFront's
 *   own 502/504 pages are HTML) and stays a server error, so GETs still retry it. This is a
 *   deliberate deviation from spec 12.2, recorded in frontend/README.md.
 * - Errors are thrown as `ApiError` carrying `status`, `error`, `message` and `details`.
 * - GET requests are retried once after 3 seconds on a network error or 5xx, to ride out
 *   an Aurora resume.
 */
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setTokens,
} from '../auth/tokenStorage.js';

/** Wait before the single GET retry; long enough for a paused database to start resuming. */
export const GET_RETRY_DELAY_MS = 3000;

const JSON_TYPE = 'application/json';

const DEFAULT_ERROR_CODES = Object.freeze({
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'ACCESS_DENIED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
});

const DEFAULT_MESSAGES = Object.freeze({
  400: 'The request is not valid.',
  401: 'Please sign in to continue.',
  403: 'You do not have permission to do that.',
  404: 'The requested resource was not found.',
  409: 'The change conflicts with existing data.',
});

/**
 * Build the API base URL from a configured origin.
 * @param {string|undefined} apiUrl - Value of VITE_API_URL (may be empty for same-origin).
 * @returns {string} Base URL ending in `/api/portfolio`.
 */
export function resolveApiBase(apiUrl) {
  return `${(apiUrl || '').replace(/\/$/, '')}/api/portfolio`;
}

/** Base URL of every API call. */
export const API_BASE_URL = resolveApiBase(import.meta.env.VITE_API_URL);

/** Typed error for every failed API call. */
export class ApiError extends Error {
  /**
   * @param {object} [init] - Error fields, usually the API's standard error body.
   * @param {number} [init.status] - HTTP status (0 when the server could not be reached).
   * @param {string} [init.error] - Machine-readable code such as VALIDATION_ERROR.
   * @param {string} [init.message] - Human-readable summary.
   * @param {Array<{field?: string, issue?: string}>} [init.details] - Per-field issues.
   */
  constructor({ status = 0, error = 'UNKNOWN_ERROR', message, details = [] } = {}) {
    super(message || 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
    this.details = Array.isArray(details) ? details : [];
  }

  /**
   * Per-field issues keyed by field name, ready to show next to form inputs.
   * @returns {Record<string, string>} The first issue reported for each field.
   */
  get fieldErrors() {
    return this.details.reduce((result, detail) => {
      if (detail && detail.field && !(detail.field in result)) {
        return { ...result, [detail.field]: detail.issue || 'Invalid value' };
      }
      return result;
    }, {});
  }
}

/**
 * Check whether a value is an ApiError.
 * @param {unknown} value - Anything caught from a request.
 * @returns {boolean} True for ApiError instances.
 */
export function isApiError(value) {
  return value instanceof ApiError;
}

/**
 * Check whether an error came from an aborted request.
 * @param {unknown} value - Anything caught from a request.
 * @returns {boolean} True when the request was cancelled with an AbortSignal.
 */
export function isAbortError(value) {
  return Boolean(value) && typeof value === 'object' && value.name === 'AbortError';
}

let authFailureHandler = null;
let refreshInFlight = null;

/**
 * Register what happens after authentication finally fails (refresh failed or was rejected).
 * AuthProvider uses it to clear React state and route to /login inside the SPA.
 * Without a handler the client does a full-page redirect to /login.
 * @param {(() => void)|null} handler - Called after the session has been cleared.
 * @returns {void}
 */
export function setAuthFailureHandler(handler) {
  authFailureHandler = typeof handler === 'function' ? handler : null;
}

function handleAuthFailure() {
  clearSession();
  if (authFailureHandler) {
    authFailureHandler();
  } else if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

/**
 * Build a full API URL with a query string. Empty, null and undefined parameters are skipped.
 * @param {string} path - Path after the base, e.g. `/projects`.
 * @param {Record<string, unknown>} [params] - Query parameters; arrays repeat the key.
 * @returns {string} Absolute or root-relative URL.
 */
export function buildUrl(path, params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    const values = Array.isArray(value) ? value : [value];
    values.forEach((item) => {
      if (item !== undefined && item !== null && item !== '') {
        query.append(key, String(item));
      }
    });
  });
  const queryString = query.toString();
  const normalisedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalisedPath}${queryString ? `?${queryString}` : ''}`;
}

function abortError(signal) {
  return signal && signal.reason ? signal.reason : new DOMException('The request was aborted.', 'AbortError');
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function isHtml(response) {
  return (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

async function readJson(response) {
  let text;
  try {
    text = await response.text();
  } catch {
    return { valid: false, value: null };
  }
  if (!text) {
    return { valid: true, value: null };
  }
  try {
    return { valid: true, value: JSON.parse(text) };
  } catch {
    return { valid: false, value: text };
  }
}

function errorFromBody(status, body) {
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const serverError = status >= 500;
  return new ApiError({
    status,
    error:
      typeof payload.error === 'string' && payload.error
        ? payload.error
        : DEFAULT_ERROR_CODES[status] || (serverError ? 'INTERNAL_ERROR' : 'HTTP_ERROR'),
    message:
      typeof payload.message === 'string' && payload.message
        ? payload.message
        : DEFAULT_MESSAGES[status] ||
          (serverError ? 'The server had a problem. Please try again.' : 'The request failed.'),
    details: Array.isArray(payload.details) ? payload.details : [],
  });
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }
  if (isHtml(response)) {
    // CloudFront's SPA rule turns an API 404 into index.html (status 200). A 5xx HTML page is
    // a gateway error page instead, so it stays a server error.
    if (response.status >= 500) {
      throw errorFromBody(response.status, null);
    }
    throw new ApiError({ status: 404, error: 'NOT_FOUND', message: DEFAULT_MESSAGES[404] });
  }
  const { valid, value } = await readJson(response);
  if (!response.ok) {
    throw errorFromBody(response.status, value);
  }
  if (!valid) {
    throw new ApiError({
      status: response.status,
      error: 'INVALID_RESPONSE',
      message: 'The server sent a response that could not be read.',
    });
  }
  return value;
}

async function requestNewAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }
  try {
    const response = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { Accept: JSON_TYPE, 'Content-Type': JSON_TYPE },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok || isHtml(response)) {
      return false;
    }
    const { value } = await readJson(response);
    if (!value || typeof value.access_token !== 'string' || !value.access_token) {
      return false;
    }
    if (typeof value.refresh_token === 'string' && value.refresh_token) {
      setTokens({ accessToken: value.access_token, refreshToken: value.refresh_token });
    } else {
      setAccessToken(value.access_token);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Exchange the refresh token for a new access token. Concurrent callers share one call.
 * @returns {Promise<boolean>} True when a new access token was stored.
 */
export function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = requestNewAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function buildInit(method, body, token, signal) {
  const headers = { Accept: JSON_TYPE };
  if (body !== undefined) {
    headers['Content-Type'] = JSON_TYPE;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

/**
 * Send one API request with the behaviour described at the top of this module.
 * @param {string} method - HTTP method.
 * @param {string} path - Path after `/api/portfolio`, e.g. `/projects/1`.
 * @param {object} [options] - Request options.
 * @param {Record<string, unknown>} [options.params] - Query parameters.
 * @param {unknown} [options.body] - JSON body for POST and PUT.
 * @param {AbortSignal} [options.signal] - Cancels the request (and any pending retry).
 * @param {boolean} [options.auth=true] - Send the token and handle 401 with refresh;
 *   false for the public auth endpoints.
 * @returns {Promise<any>} Parsed JSON body, or null for 204.
 * @throws {ApiError} For any error response, or when the server cannot be reached.
 */
export async function request(method, path, { params, body, signal, auth = true } = {}) {
  const verb = String(method).toUpperCase();
  const url = buildUrl(path, params);
  const retryOnServerError = verb === 'GET';
  let retriedServerError = false;
  let retriedAuth = false;

  for (;;) {
    const token = auth ? getAccessToken() : null;
    let response;
    try {
      response = await fetch(url, buildInit(verb, body, token, signal));
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (retryOnServerError && !retriedServerError) {
        retriedServerError = true;
        await wait(GET_RETRY_DELAY_MS, signal);
        continue;
      }
      throw new ApiError({
        status: 0,
        error: 'NETWORK_ERROR',
        message: 'Could not reach the server. Check your connection and try again.',
      });
    }

    if (response.status >= 500 && retryOnServerError && !retriedServerError) {
      retriedServerError = true;
      await wait(GET_RETRY_DELAY_MS, signal);
      continue;
    }

    if (response.status === 401 && auth) {
      if (!retriedAuth) {
        retriedAuth = true;
        const current = getAccessToken();
        // Another request may already have refreshed the token while this one was in flight.
        if ((current && current !== token) || (await refreshAccessToken())) {
          continue;
        }
      }
      handleAuthFailure();
      throw new ApiError({
        status: 401,
        error: 'UNAUTHENTICATED',
        message: 'Your session has expired. Please sign in again.',
      });
    }

    return parseResponse(response);
  }
}

/** Convenience methods over `request`. */
const apiClient = Object.freeze({
  /**
   * @param {string} path - API path.
   * @param {object} [options] - See `request`.
   * @returns {Promise<any>} Parsed body.
   */
  get: (path, options) => request('GET', path, options),
  /**
   * @param {string} path - API path.
   * @param {unknown} body - JSON body.
   * @param {object} [options] - See `request`.
   * @returns {Promise<any>} Parsed body.
   */
  post: (path, body, options) => request('POST', path, { ...options, body }),
  /**
   * @param {string} path - API path.
   * @param {unknown} body - JSON body.
   * @param {object} [options] - See `request`.
   * @returns {Promise<any>} Parsed body.
   */
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  /**
   * @param {string} path - API path.
   * @param {object} [options] - See `request`.
   * @returns {Promise<null>} Resolves to null (204).
   */
  delete: (path, options) => request('DELETE', path, options),
});

export default apiClient;
