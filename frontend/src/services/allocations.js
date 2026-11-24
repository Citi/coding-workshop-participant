/**
 * Resource allocation endpoints. Everyone can read; ADMIN and PM can create, update and delete.
 * Over-allocation never blocks a save: POST and PUT responses carry `capacity_warning`.
 */
import apiClient from './apiClient.js';
import { itemPath } from './path.js';

const BASE = '/allocations';

/**
 * List allocations.
 * @param {{user_id?: number, project_id?: number, limit?: number, offset?: number}} [params] - Filters.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{items: object[], total: number}>} One page of `AllocationOut`.
 */
export function listAllocations(params = {}, options = {}) {
  return apiClient.get(BASE, { ...options, params });
}

/**
 * Get one allocation.
 * @param {number|string} id - Allocation id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The `AllocationOut`.
 */
export function getAllocation(id, options = {}) {
  return apiClient.get(itemPath(BASE, id), options);
}

/**
 * Create an allocation (ADMIN, PM).
 * @param {{user_id: number, project_id: number, deliverable_id?: number|null, allocation_percentage: number, start_date: string, end_date: string}} body
 *   New allocation.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The created `AllocationOut` plus `capacity_warning` (null or details).
 */
export function createAllocation(body, options = {}) {
  return apiClient.post(BASE, body, options);
}

/**
 * Update an allocation (ADMIN, PM).
 * @param {number|string} id - Allocation id.
 * @param {object} body - Fields to change.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The updated `AllocationOut` plus `capacity_warning`.
 */
export function updateAllocation(id, body, options = {}) {
  return apiClient.put(itemPath(BASE, id), body, options);
}

/**
 * Delete an allocation (ADMIN, PM).
 * @param {number|string} id - Allocation id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<null>} Resolves when deleted.
 */
export function deleteAllocation(id, options = {}) {
  return apiClient.delete(itemPath(BASE, id), options);
}
