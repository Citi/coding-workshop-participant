import {
  ACTIONS,
  AUDIT_PAGE_ROLES,
  PERMISSIONS,
  RESOURCES,
  USERS_PAGE_ROLES,
  can,
  rolesAllowed,
} from './permissions.js';
import { ROLES } from '../constants.js';

// Spec section 7, transcribed cell by cell: C = create, R = read, U = update, D = delete.
// Read is implied where the spec lists only write actions for a role (LEAD rows).
const SPEC_TABLE = {
  users: { ADMIN: 'CRUD', PM: 'R', LEAD: 'R', VIEWER: 'R' },
  departments: { ADMIN: 'CRUD', PM: 'R', LEAD: 'R', VIEWER: 'R' },
  projects: { ADMIN: 'CRUD', PM: 'CRUD', LEAD: 'R', VIEWER: 'R' },
  deliverables: { ADMIN: 'CRUD', PM: 'CRUD', LEAD: 'CRU', VIEWER: 'R' },
  dependencies: { ADMIN: 'CRD', PM: 'CRD', LEAD: 'CR', VIEWER: 'R' },
  allocations: { ADMIN: 'CRUD', PM: 'CRUD', LEAD: 'R', VIEWER: 'R' },
  budgetEntries: { ADMIN: 'CRUD', PM: 'CRUD', LEAD: 'R', VIEWER: 'R' },
  analytics: { ADMIN: 'R', PM: 'R', LEAD: 'R', VIEWER: 'R' },
  auditLogs: { ADMIN: 'R', PM: 'R', LEAD: '', VIEWER: '' },
};

const LETTER = { create: 'C', read: 'R', update: 'U', delete: 'D' };

const MATRIX = Object.entries(SPEC_TABLE).flatMap(([resource, byRole]) =>
  Object.entries(byRole).flatMap(([role, letters]) =>
    ACTIONS.map((action) => [role, action, resource, letters.includes(LETTER[action])]),
  ),
);

describe('can (spec section 7 matrix)', () => {
  it('covers every resource, role and action', () => {
    expect(Object.keys(SPEC_TABLE).sort()).toEqual([...RESOURCES].sort());
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...RESOURCES].sort());
    expect(MATRIX).toHaveLength(RESOURCES.length * ROLES.length * ACTIONS.length);
  });

  it.each(MATRIX)('%s %s %s -> %s', (role, action, resource, expected) => {
    expect(can(role, action, resource)).toBe(expected);
  });

  it('accepts upper-case actions and API-style resource names', () => {
    expect(can('PM', 'CREATE', 'projects')).toBe(true);
    expect(can('PM', 'delete', 'budget-entries')).toBe(true);
    expect(can('PM', 'delete', 'budget_entry')).toBe(true);
    expect(can('PM', 'read', 'audit-logs')).toBe(true);
    expect(can('LEAD', 'read', 'audit_logs')).toBe(false);
    expect(can('LEAD', 'update', 'deliverable')).toBe(true);
    expect(can('ADMIN', 'update', 'roles')).toBe(true);
  });

  it('denies unknown, missing or prototype-polluting inputs', () => {
    expect(can(null, 'read', 'projects')).toBe(false);
    expect(can(undefined, 'read', 'projects')).toBe(false);
    expect(can('OWNER', 'read', 'projects')).toBe(false);
    expect(can('ADMIN', 'approve', 'projects')).toBe(false);
    expect(can('ADMIN', 'read', 'invoices')).toBe(false);
    expect(can('ADMIN', 'read', 'constructor')).toBe(false);
    expect(can('constructor', 'read', 'projects')).toBe(false);
    expect(can('ADMIN', undefined, 'projects')).toBe(false);
  });

  it('never lets LEAD delete anything or VIEWER change anything', () => {
    RESOURCES.forEach((resource) => {
      expect(can('LEAD', 'delete', resource)).toBe(false);
      ['create', 'update', 'delete'].forEach((action) => {
        expect(can('VIEWER', action, resource)).toBe(false);
      });
    });
  });
});

describe('page role lists derived from the matrix', () => {
  it('opens the audit log to ADMIN and PM only', () => {
    expect(AUDIT_PAGE_ROLES).toEqual(['ADMIN', 'PM']);
  });

  it('opens user administration to ADMIN only', () => {
    expect(USERS_PAGE_ROLES).toEqual(['ADMIN']);
  });

  it('lists the roles allowed for an action', () => {
    expect(rolesAllowed('create', 'deliverables')).toEqual(['ADMIN', 'PM', 'LEAD']);
    expect(rolesAllowed('delete', 'dependencies')).toEqual(['ADMIN', 'PM']);
    expect(rolesAllowed('read', 'analytics')).toEqual(['ADMIN', 'PM', 'LEAD', 'VIEWER']);
  });
});
