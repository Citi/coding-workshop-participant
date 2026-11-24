/**
 * Role permissions, mirroring spec section 7 exactly. The server enforces them on every
 * route; the UI uses `can` only to hide actions a role cannot perform.
 *
 * Reading is implied wherever the matrix lists write actions for a role (for example LEAD
 * "create, update" on deliverables): every role can read every resource except audit logs.
 */
import { ROLES } from '../constants.js';

/** Actions understood by `can`. */
export const ACTIONS = Object.freeze(['create', 'read', 'update', 'delete']);

/** Resources understood by `can`, one per row of the spec section 7 table. */
export const RESOURCES = Object.freeze([
  'users',
  'departments',
  'projects',
  'deliverables',
  'dependencies',
  'allocations',
  'budgetEntries',
  'analytics',
  'auditLogs',
]);

const CRUD = Object.freeze(['create', 'read', 'update', 'delete']);
const READ = Object.freeze(['read']);
const NONE = Object.freeze([]);

/** resource -> role -> allowed actions (spec section 7). */
export const PERMISSIONS = Object.freeze({
  users: Object.freeze({ ADMIN: CRUD, PM: READ, LEAD: READ, VIEWER: READ }),
  departments: Object.freeze({ ADMIN: CRUD, PM: READ, LEAD: READ, VIEWER: READ }),
  projects: Object.freeze({ ADMIN: CRUD, PM: CRUD, LEAD: READ, VIEWER: READ }),
  deliverables: Object.freeze({
    ADMIN: CRUD,
    PM: CRUD,
    LEAD: Object.freeze(['create', 'read', 'update']),
    VIEWER: READ,
  }),
  dependencies: Object.freeze({
    ADMIN: Object.freeze(['create', 'read', 'delete']),
    PM: Object.freeze(['create', 'read', 'delete']),
    LEAD: Object.freeze(['create', 'read']),
    VIEWER: READ,
  }),
  allocations: Object.freeze({ ADMIN: CRUD, PM: CRUD, LEAD: READ, VIEWER: READ }),
  budgetEntries: Object.freeze({ ADMIN: CRUD, PM: CRUD, LEAD: READ, VIEWER: READ }),
  analytics: Object.freeze({ ADMIN: READ, PM: READ, LEAD: READ, VIEWER: READ }),
  auditLogs: Object.freeze({ ADMIN: READ, PM: READ, LEAD: NONE, VIEWER: NONE }),
});

/** Other spellings accepted for resource names (API paths and entity types). */
const RESOURCE_ALIASES = Object.freeze({
  user: 'users',
  roles: 'users',
  department: 'departments',
  project: 'projects',
  deliverable: 'deliverables',
  dependency: 'dependencies',
  allocation: 'allocations',
  budget_entry: 'budgetEntries',
  budget_entries: 'budgetEntries',
  'budget-entries': 'budgetEntries',
  audit: 'auditLogs',
  audit_logs: 'auditLogs',
  'audit-logs': 'auditLogs',
});

function normaliseResource(resource) {
  if (typeof resource !== 'string') {
    return null;
  }
  if (Object.hasOwn(PERMISSIONS, resource)) {
    return resource;
  }
  return Object.hasOwn(RESOURCE_ALIASES, resource) ? RESOURCE_ALIASES[resource] : null;
}

/**
 * Decide whether a role may perform an action on a resource.
 * @param {string|null|undefined} role - ADMIN, PM, LEAD or VIEWER.
 * @param {string} action - create, read, update or delete.
 * @param {string} resource - One of RESOURCES (aliases such as `budget-entries` work too).
 * @returns {boolean} True when spec section 7 allows it; false for anything unknown.
 */
export function can(role, action, resource) {
  const key = normaliseResource(resource);
  if (!key || typeof role !== 'string' || typeof action !== 'string') {
    return false;
  }
  const byRole = PERMISSIONS[key];
  if (!Object.hasOwn(byRole, role)) {
    return false;
  }
  return byRole[role].includes(action.toLowerCase());
}

/**
 * List the roles allowed to perform an action on a resource.
 * Routes and navigation use it so they cannot drift from the matrix.
 * @param {string} action - create, read, update or delete.
 * @param {string} resource - One of RESOURCES.
 * @returns {string[]} Allowed roles, most privileged first.
 */
export function rolesAllowed(action, resource) {
  return ROLES.filter((role) => can(role, action, resource));
}

/** Roles that may open the Audit Log page (spec 12.3: ADMIN and PM). */
export const AUDIT_PAGE_ROLES = Object.freeze(rolesAllowed('read', 'auditLogs'));

/** Roles that may open the Users page, where roles are changed (spec 12.3: ADMIN only). */
export const USERS_PAGE_ROLES = Object.freeze(rolesAllowed('update', 'users'));
