import { createServiceClient, unwrap } from './api';

/**
 * People and their allocations to projects. Backed by backend/resources.
 *
 * A "resource" is the person and their capacity; an "allocation" commits a
 * percentage of that capacity to one project over a date range. Utilization is
 * the sum of a person's currently-active allocations.
 */

const client = createServiceClient('resources');
const RESOURCE = '/resources';

/**
 * @param {object} params
 * @param {string} [params.search]
 * @param {string} [params.roleTitle]
 * @param {boolean} [params.overAllocated] only people past their capacity
 * @param {boolean} [params.availableOnly] only people with headroom left
 */
export function listResources(params = {}) {
  return unwrap(client.get(RESOURCE, { params }));
}

/** The person, plus the projects they are currently allocated to. */
export function getResource(id) {
  return unwrap(client.get(`${RESOURCE}/${id}`));
}

export function createResource(payload) {
  return unwrap(client.post(RESOURCE, payload));
}

export function updateResource(id, payload) {
  return unwrap(client.put(`${RESOURCE}/${id}`, payload));
}

export function deleteResource(id) {
  return unwrap(client.delete(`${RESOURCE}/${id}`));
}

/** Per-person load and over-allocation, straight from v_resource_utilization. */
export function getUtilization() {
  return unwrap(client.get(`${RESOURCE}/utilization`));
}

// -- Allocations ------------------------------------------------------------

export function listResourceAllocations(resourceId) {
  return unwrap(client.get(`${RESOURCE}/${resourceId}/allocations`));
}

/**
 * @param {object} params
 * @param {string} [params.resourceId]
 * @param {string} [params.projectId]
 * @param {boolean} [params.activeOnly]
 */
export function listAllocations(params = {}) {
  return unwrap(client.get('/allocations', { params }));
}

/**
 * Creates an allocation.
 *
 * A 201 may still carry an `overAllocation` block when the commitment pushes
 * the person past capacity -- the write succeeds and the UI surfaces it,
 * because deliberate over-allocation is real and the brief asks us to report
 * conflicts rather than forbid them.
 */
export function createAllocation(payload) {
  return unwrap(client.post('/allocations', payload));
}

export function updateAllocation(id, payload) {
  return unwrap(client.put(`/allocations/${id}`, payload));
}

export function deleteAllocation(id) {
  return unwrap(client.delete(`/allocations/${id}`));
}
