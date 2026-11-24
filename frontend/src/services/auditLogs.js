/**
 * Audit log endpoint (ADMIN and PM). Entries are append-only and newest first.
 */
import apiClient from './apiClient.js';

/**
 * List audit log entries.
 * @param {{entity_type?: string, entity_id?: number, actor_id?: number, limit?: number, offset?: number}} [params] - Filters.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{items: object[], total: number}>} One page of `AuditLogOut`.
 */
export function listAuditLogs(params = {}, options = {}) {
  return apiClient.get('/audit-logs', { ...options, params });
}
