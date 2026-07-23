import { createServiceClient, unwrap } from './api';

/**
 * Deliverables and their dependency graph. Backed by backend/deliverables.
 */

const client = createServiceClient('deliverables');
const RESOURCE = '/deliverables';

/**
 * @param {object} params
 * @param {string} [params.projectId]
 * @param {string} [params.status]      not_started|in_progress|blocked|completed|cancelled
 * @param {string} [params.assigneeId]
 * @param {string} [params.dueBefore]   ISO date
 * @param {boolean} [params.overdueOnly]
 * @param {string} [params.search]
 */
export function listDeliverables(params = {}) {
  return unwrap(client.get(RESOURCE, { params }));
}

export function getDeliverable(id) {
  return unwrap(client.get(`${RESOURCE}/${id}`));
}

export function createDeliverable(payload) {
  return unwrap(client.post(RESOURCE, payload));
}

export function updateDeliverable(id, payload) {
  return unwrap(client.put(`${RESOURCE}/${id}`, payload));
}

export function deleteDeliverable(id) {
  return unwrap(client.delete(`${RESOURCE}/${id}`));
}

/**
 * Status-only transition. Separate from the full update so a table can move an
 * item without round-tripping every other field -- and so an EMPLOYEE, who may
 * update but not create or delete, has an endpoint scoped to what they can do.
 */
export function updateDeliverableStatus(id, status, completionPercentage) {
  return unwrap(client.patch(`${RESOURCE}/${id}/status`, { status, completionPercentage }));
}

// -- Dependencies -----------------------------------------------------------

/**
 * The prerequisite chain for one deliverable, depth-annotated, plus whatever
 * is currently blocking it.
 */
export function getDependencyChain(id) {
  return unwrap(client.get(`${RESOURCE}/${id}/chain`));
}

/** Adds "this deliverable depends on `dependsOnId`". Rejected if it would cycle. */
export function addDependency(id, dependsOnId) {
  return unwrap(client.post(`${RESOURCE}/${id}/dependencies`, { dependsOnId }));
}

export function removeDependency(id, dependsOnId) {
  return unwrap(client.delete(`${RESOURCE}/${id}/dependencies/${dependsOnId}`));
}

/** Nodes and edges for one project's whole graph. */
export function getProjectGraph(projectId) {
  return unwrap(client.get(`/projects/${projectId}/graph`));
}
