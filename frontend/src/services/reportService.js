import { createServiceClient, unwrap } from './api';

/**
 * Read-only analytics. Backed by backend/reports.
 *
 * These are aggregates the database computes. The UI must not recreate them by
 * pulling whole collections and reducing client-side -- that would neither
 * scale nor agree with what other clients see.
 *
 * Requires `generate_reports`, which EMPLOYEE does not have; call these only
 * behind a RoleGate or the request comes back 403.
 */

const client = createServiceClient('reports');
const RESOURCE = '/reports';

/** Headline counters for the dashboard. */
export function getDashboardSummary() {
  return unwrap(client.get(`${RESOURCE}/summary`));
}

/** Projects in trouble, each with a riskLevel and the reasons behind it. */
export function getAtRiskProjects(params = {}) {
  return unwrap(client.get(`${RESOURCE}/at-risk`, { params }));
}

/** Per-person load, flagging anyone allocated beyond their capacity. */
export function getUtilization(params = {}) {
  return unwrap(client.get(`${RESOURCE}/utilization`, { params }));
}

/** One row per active resource/project pairing -- the allocation matrix. */
export function getAllocations(params = {}) {
  return unwrap(client.get(`${RESOURCE}/allocations`, { params }));
}

/** The deliverable graph: `{ nodes, edges, bottlenecks }`. */
export function getDependencies(params = {}) {
  return unwrap(client.get(`${RESOURCE}/dependencies`, { params }));
}

/** Consumed vs planned for every project. */
export function getBudgetReport(params = {}) {
  return unwrap(client.get(`${RESOURCE}/budget`, { params }));
}
