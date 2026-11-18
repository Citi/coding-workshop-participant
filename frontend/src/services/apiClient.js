// Base URL: the dev proxy (http://localhost:3001) locally, CloudFront in AWS.
// The FastAPI backend is the `api-service` Lambda: `${API_URL}/api/api-service/<path>`.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const API_BASE = `${API_URL}/api/api-service`;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  return sessionStorage.getItem('token');
}

export function saveSession(token, user) {
  sessionStorage.setItem('token', token);
  sessionStorage.setItem('user', JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
}

// Called when any request comes back 401 (expired / invalid session)
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

function toQuery(params) {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    (Array.isArray(value) ? value : [value]).forEach((v) => qs.append(key, v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function apiRequest(path, { method = 'GET', body, params } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}${toQuery(params)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const detail = typeof data.detail === 'string' ? data.detail : null;
    throw new ApiError(res.status, data.message || detail || 'Something went wrong. Please try again.');
  }
  return data;
}
