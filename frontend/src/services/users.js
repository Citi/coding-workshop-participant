/**
 * Users endpoints. Everyone can read; only ADMIN can create, update or delete.
 */
import apiClient from './apiClient.js';
import { itemPath } from './path.js';

const BASE = '/users';

/**
 * List users.
 * @param {{q?: string, role?: string, department_id?: number, limit?: number, offset?: number}} [params] - Filters.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{items: object[], total: number}>} One page of `UserOut`.
 */
export function listUsers(params = {}, options = {}) {
  return apiClient.get(BASE, { ...options, params });
}

/**
 * Get one user.
 * @param {number|string} id - User id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The `UserOut`.
 */
export function getUser(id, options = {}) {
  return apiClient.get(itemPath(BASE, id), options);
}

/**
 * Create a user with any role (ADMIN only).
 * @param {{name: string, email: string, password: string, role: string, department_id?: number|null}} body - New user.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The created `UserOut`.
 */
export function createUser(body, options = {}) {
  return apiClient.post(BASE, body, options);
}

/**
 * Update a user (ADMIN only). Send any subset of name, email, role, department_id, password.
 * @param {number|string} id - User id.
 * @param {object} body - Fields to change.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The updated `UserOut`.
 */
export function updateUser(id, body, options = {}) {
  return apiClient.put(itemPath(BASE, id), body, options);
}

/**
 * Delete a user (ADMIN only).
 * @param {number|string} id - User id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<null>} Resolves when deleted.
 */
export function deleteUser(id, options = {}) {
  return apiClient.delete(itemPath(BASE, id), options);
}
