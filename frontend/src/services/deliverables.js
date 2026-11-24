/**
 * Deliverables endpoints and downstream impact.
 * Everyone can read; ADMIN and PM have full access; LEAD can create and update.
 */
import apiClient from './apiClient.js';
import { itemPath } from './path.js';

const BASE = '/deliverables';

/**
 * List deliverables across the portfolio.
 * @param {{q?: string, project_id?: number, status?: string, assigned_user_id?: number, overdue?: boolean, limit?: number, offset?: number}} [params]
 *   Filters; pass `overdue: true` for overdue items only.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{items: object[], total: number}>} One page of `DeliverableOut`.
 */
export function listDeliverables(params = {}, options = {}) {
  return apiClient.get(BASE, { ...options, params });
}

/**
 * Get one deliverable.
 * @param {number|string} id - Deliverable id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The `DeliverableOut`.
 */
export function getDeliverable(id, options = {}) {
  return apiClient.get(itemPath(BASE, id), options);
}

/**
 * Create a deliverable (ADMIN, PM, LEAD).
 * @param {object} body - project_id, title, description, assigned_user_id, start_date,
 *   due_date, completion_percentage, status, blocked_reason.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The created `DeliverableOut`.
 */
export function createDeliverable(body, options = {}) {
  return apiClient.post(BASE, body, options);
}

/**
 * Update a deliverable (ADMIN, PM, LEAD).
 * @param {number|string} id - Deliverable id.
 * @param {object} body - Fields to change.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The updated `DeliverableOut`.
 */
export function updateDeliverable(id, body, options = {}) {
  return apiClient.put(itemPath(BASE, id), body, options);
}

/**
 * Delete a deliverable (ADMIN, PM).
 * @param {number|string} id - Deliverable id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<null>} Resolves when deleted.
 */
export function deleteDeliverable(id, options = {}) {
  return apiClient.delete(itemPath(BASE, id), options);
}

/**
 * Downstream deliverables affected by this one, with their depth.
 * @param {number|string} id - Deliverable id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{deliverable_id: number, title: string, items: object[], total: number}>} Impact list.
 */
export function getDeliverableImpact(id, options = {}) {
  return apiClient.get(itemPath(BASE, id, '/impact'), options);
}
