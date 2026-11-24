/**
 * Departments endpoints. Everyone can read; only ADMIN can create, update or delete.
 */
import apiClient from './apiClient.js';
import { itemPath } from './path.js';

const BASE = '/departments';

/**
 * List departments.
 * @param {{limit?: number, offset?: number}} [params] - Paging.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{items: object[], total: number}>} One page of `DepartmentOut`.
 */
export function listDepartments(params = {}, options = {}) {
  return apiClient.get(BASE, { ...options, params });
}

/**
 * Get one department.
 * @param {number|string} id - Department id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The `DepartmentOut`.
 */
export function getDepartment(id, options = {}) {
  return apiClient.get(itemPath(BASE, id), options);
}

/**
 * Create a department (ADMIN only).
 * @param {{name: string}} body - New department.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The created `DepartmentOut`.
 */
export function createDepartment(body, options = {}) {
  return apiClient.post(BASE, body, options);
}

/**
 * Rename a department (ADMIN only).
 * @param {number|string} id - Department id.
 * @param {{name: string}} body - New name.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The updated `DepartmentOut`.
 */
export function updateDepartment(id, body, options = {}) {
  return apiClient.put(itemPath(BASE, id), body, options);
}

/**
 * Delete a department (ADMIN only; 409 while projects use it).
 * @param {number|string} id - Department id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<null>} Resolves when deleted.
 */
export function deleteDepartment(id, options = {}) {
  return apiClient.delete(itemPath(BASE, id), options);
}
