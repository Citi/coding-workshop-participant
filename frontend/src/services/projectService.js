import { createServiceClient, unwrap } from './api';

/**
 * Projects. Backed by backend/projects.
 *
 * The service's routes live under /projects, so the full path is
 * {API_ROOT}/api/projects/projects. The double segment is deliberate: the
 * first names the Lambda, the second the resource within it.
 */

const client = createServiceClient('projects');
const RESOURCE = '/projects';

/**
 * @param {object} params
 * @param {string} [params.search]     matches name, description or department
 * @param {string} [params.status]     planning|active|on_hold|completed|cancelled
 * @param {string} [params.department]
 * @param {string} [params.ownerId]    UUID of the manager
 * @param {boolean} [params.atRisk]
 */
export function listProjects(params = {}) {
  return unwrap(client.get(RESOURCE, { params }));
}

export function getProject(id) {
  return unwrap(client.get(`${RESOURCE}/${id}`));
}

export function createProject(payload) {
  return unwrap(client.post(RESOURCE, payload));
}

export function updateProject(id, payload) {
  return unwrap(client.put(`${RESOURCE}/${id}`, payload));
}

/** Returns nothing: the API answers 204 on a successful delete. */
export function deleteProject(id) {
  return unwrap(client.delete(`${RESOURCE}/${id}`));
}

/** Deliverable counts, budget roll-up and risk flag for one project. */
export function getProjectSummary(id) {
  return unwrap(client.get(`${RESOURCE}/${id}/summary`));
}
