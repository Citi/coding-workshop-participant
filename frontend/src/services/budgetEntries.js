/**
 * Budget entry endpoints (actual spend). Everyone can read; ADMIN and PM can create, update and delete.
 */
import apiClient from './apiClient.js';
import { itemPath } from './path.js';

const BASE = '/budget-entries';

/**
 * List budget entries.
 * @param {{project_id?: number, category?: string, limit?: number, offset?: number}} [params] - Filters.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{items: object[], total: number}>} One page of `BudgetEntryOut`.
 */
export function listBudgetEntries(params = {}, options = {}) {
  return apiClient.get(BASE, { ...options, params });
}

/**
 * Get one budget entry.
 * @param {number|string} id - Budget entry id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The `BudgetEntryOut`.
 */
export function getBudgetEntry(id, options = {}) {
  return apiClient.get(itemPath(BASE, id), options);
}

/**
 * Record spend against a project (ADMIN, PM).
 * @param {{project_id: number, category: string, description?: string, amount: string|number, entry_date: string}} body
 *   New entry; send amount as a decimal string such as "1500.00".
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The created `BudgetEntryOut`.
 */
export function createBudgetEntry(body, options = {}) {
  return apiClient.post(BASE, body, options);
}

/**
 * Update a budget entry (ADMIN, PM).
 * @param {number|string} id - Budget entry id.
 * @param {object} body - Fields to change.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The updated `BudgetEntryOut`.
 */
export function updateBudgetEntry(id, body, options = {}) {
  return apiClient.put(itemPath(BASE, id), body, options);
}

/**
 * Delete a budget entry (ADMIN, PM).
 * @param {number|string} id - Budget entry id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<null>} Resolves when deleted.
 */
export function deleteBudgetEntry(id, options = {}) {
  return apiClient.delete(itemPath(BASE, id), options);
}
