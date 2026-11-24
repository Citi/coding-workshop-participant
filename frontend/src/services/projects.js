/**
 * Projects endpoints, including each project's risk detail and dependency graph.
 * Everyone can read; ADMIN and PM can create, update and delete.
 */
import apiClient from './apiClient.js';
import { itemPath } from './path.js';

const BASE = '/projects';

/**
 * List projects. Each item includes completion_pct, actual_spend, utilization_pct,
 * risk_score and risk_level.
 * @param {{q?: string, department_id?: number, status?: string, risk_level?: string, limit?: number, offset?: number}} [params] - Filters.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{items: object[], total: number}>} One page of `ProjectOut`.
 */
export function listProjects(params = {}, options = {}) {
  return apiClient.get(BASE, { ...options, params });
}

/**
 * Get one project.
 * @param {number|string} id - Project id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The `ProjectOut`.
 */
export function getProject(id, options = {}) {
  return apiClient.get(itemPath(BASE, id), options);
}

/**
 * Create a project (ADMIN, PM).
 * @param {object} body - project_name, description, department_id, project_manager_id,
 *   start_date, end_date, planned_budget, status.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The created `ProjectOut`.
 */
export function createProject(body, options = {}) {
  return apiClient.post(BASE, body, options);
}

/**
 * Update a project (ADMIN, PM).
 * @param {number|string} id - Project id.
 * @param {object} body - Fields to change.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} The updated `ProjectOut`.
 */
export function updateProject(id, body, options = {}) {
  return apiClient.put(itemPath(BASE, id), body, options);
}

/**
 * Delete a project and everything that belongs to it (ADMIN, PM).
 * @param {number|string} id - Project id.
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<null>} Resolves when deleted.
 */
export function deleteProject(id, options = {}) {
  return apiClient.delete(itemPath(BASE, id), options);
}

/**
 * Full risk detail for one project: factors, evidence, impacted deliverables and actions.
 * @param {number|string} id - Project id.
 * @param {{as_of?: string}} [params] - Optional analysis date (YYYY-MM-DD).
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<object>} Risk detail (spec section 9.4).
 */
export function getProjectRisk(id, params = {}, options = {}) {
  return apiClient.get(itemPath(BASE, id, '/risk'), { ...options, params });
}

/**
 * Dependency graph of one project, with topological levels, root causes and impacted items.
 * @param {number|string} id - Project id.
 * @param {{as_of?: string}} [params] - Optional analysis date (YYYY-MM-DD).
 * @param {{signal?: AbortSignal}} [options] - Request options.
 * @returns {Promise<{project_id: number, nodes: object[], edges: object[], levels: number[][], roots: number[], impacted: object[]}>}
 *   The graph.
 */
export function getProjectDependencyGraph(id, params = {}, options = {}) {
  return apiClient.get(itemPath(BASE, id, '/dependency-graph'), { ...options, params });
}
