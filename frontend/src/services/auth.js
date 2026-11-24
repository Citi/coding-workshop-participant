/**
 * Authentication endpoints: register, login, refresh and the current user.
 */
import apiClient from './apiClient.js';

/**
 * Create an account. The server always gives new accounts the VIEWER role.
 * @param {{name: string, email: string, password: string, department_id?: number|null}} body - New account.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The created `UserOut`.
 */
export function register({ name, email, password, department_id: departmentId } = {}, options = {}) {
  const body = { name, email, password };
  if (departmentId !== undefined && departmentId !== null && departmentId !== '') {
    body.department_id = Number(departmentId);
  }
  return apiClient.post('/auth/register', body, { ...options, auth: false });
}

/**
 * Sign in with email and password.
 * @param {string} email - Account email (case-insensitive).
 * @param {string} password - Account password.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{access_token: string, refresh_token: string, token_type: string, expires_in: number, user: object}>}
 *   Tokens and the signed-in `UserOut`.
 */
export function login(email, password, options = {}) {
  return apiClient.post('/auth/login', { email, password }, { ...options, auth: false });
}

/**
 * Exchange a refresh token for a new access token.
 * The API client calls this flow itself on a 401; use this only for an explicit refresh.
 * @param {string} refreshToken - Refresh token from login.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number}>} New access token.
 */
export function refresh(refreshToken, options = {}) {
  return apiClient.post('/auth/refresh', { refresh_token: refreshToken }, { ...options, auth: false });
}

/**
 * Load the signed-in user's profile (role changes apply immediately).
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The current `UserOut`.
 */
export function getMe(options = {}) {
  return apiClient.get('/auth/me', options);
}
