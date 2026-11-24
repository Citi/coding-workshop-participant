/**
 * Deliverable dependency endpoints. Edges run predecessor -> successor and may cross projects.
 * Everyone can read; ADMIN and PM can create and delete; LEAD can create.
 */
import apiClient from './apiClient.js';
import { itemPath } from './path.js';

const BASE = '/dependencies';

/**
 * List dependency edges.
 * @param {{project_id?: number, limit?: number, offset?: number}} [params] - Filters.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{items: object[], total: number}>} One page of `DependencyOut`.
 */
export function listDependencies(params = {}, options = {}) {
  return apiClient.get(BASE, { ...options, params });
}

/**
 * Add a dependency. A cycle is rejected with 400 DEPENDENCY_CYCLE and the path in the message.
 * @param {{predecessor_deliverable_id: number, successor_deliverable_id: number}} body - The edge.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The created `DependencyOut`.
 */
export function createDependency(body, options = {}) {
  return apiClient.post(BASE, body, options);
}

/**
 * Remove a dependency (ADMIN, PM).
 * @param {number|string} id - Dependency id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<null>} Resolves when deleted.
 */
export function deleteDependency(id, options = {}) {
  return apiClient.delete(itemPath(BASE, id), options);
}
