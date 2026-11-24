/**
 * Analytics endpoints. All roles can read them. Each accepts an optional `as_of`
 * (YYYY-MM-DD); the server defaults to today's UTC date.
 */
import apiClient from './apiClient.js';

/**
 * Executive dashboard: counts by status and risk level, budget totals, departments,
 * over-allocated count, top risks and the last 10 audit events (ADMIN and PM only).
 * @param {{as_of?: string}} [params] - Optional analysis date.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} Dashboard data.
 */
export function getDashboard(params = {}, options = {}) {
  return apiClient.get('/analytics/dashboard', { ...options, params });
}

/**
 * Per-employee peak load, segments, conflict windows and compound-bottleneck flags.
 * @param {{department_id?: number, from?: string, to?: string, as_of?: string}} [params] - Filters.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{as_of: string, employees: object[], over_allocated_count: number}>} Capacity data.
 */
export function getCapacity(params = {}, options = {}) {
  return apiClient.get('/analytics/capacity', { ...options, params });
}

/**
 * Per-project and per-department budget rollups with utilization versus completion.
 * @param {{as_of?: string}} [params] - Optional analysis date.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{as_of: string, projects: object[], departments: object[], totals: object}>} Budget data.
 */
export function getBudgetAnalytics(params = {}, options = {}) {
  return apiClient.get('/analytics/budget', { ...options, params });
}

/**
 * Risk summary for every project, sorted by score (highest first).
 * @param {{as_of?: string}} [params] - Optional analysis date.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{as_of: string, items: object[]}>} Risk summaries.
 */
export function getRiskAnalytics(params = {}, options = {}) {
  return apiClient.get('/analytics/risk', { ...options, params });
}
