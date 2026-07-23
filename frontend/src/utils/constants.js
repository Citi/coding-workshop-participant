/**
 * Enums, role rules and storage keys.
 *
 * Status values are the exact strings the database stores -- they mirror the
 * CHECK constraints in backend/schema.sql. Never send a display label to the
 * API; send the value and render the label.
 */

// --------------------------------------------------------------------------
// Roles
// --------------------------------------------------------------------------

export const ROLES = {
  ADMIN: 'ADMIN',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  TEAM_LEADER: 'TEAM_LEADER',
  EMPLOYEE: 'EMPLOYEE',
  STAKEHOLDER: 'STAKEHOLDER',
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.PROJECT_MANAGER]: 'Project Manager',
  [ROLES.TEAM_LEADER]: 'Team Leader',
  [ROLES.EMPLOYEE]: 'Employee',
  [ROLES.STAKEHOLDER]: 'Stakeholder',
};

export const ROLE_DESCRIPTIONS = {
  [ROLES.ADMIN]: 'Full system access. Manages users, projects, budgets, resources and reports.',
  [ROLES.PROJECT_MANAGER]:
    'Creates and manages projects, assigns team leaders, allocates budgets and resources.',
  [ROLES.TEAM_LEADER]:
    'Leads a project team, assigns deliverables, updates progress, monitors team workload.',
  [ROLES.EMPLOYEE]: 'Views assigned projects and deliverables, updates task status and progress.',
  [ROLES.STAKEHOLDER]: 'Read-only access to dashboards, project status, budgets and reports.',
};

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

/**
 * How the signup form explains which role an address will earn.
 *
 * The backend decides this (see role_for_email in backend/auth/models.py); the
 * client only describes the rule so the user is not surprised by the result.
 */
export const ROLE_HINTS = [
  { pattern: 'name.admin@acme.com', role: ROLES.ADMIN },
  { pattern: 'name.mr@acme.com', role: ROLES.PROJECT_MANAGER },
  { pattern: 'name.tl@acme.com', role: ROLES.TEAM_LEADER },
  { pattern: 'name@acme.com', role: ROLES.EMPLOYEE },
  { pattern: 'anything else', role: ROLES.STAKEHOLDER },
];

// --------------------------------------------------------------------------
// Permissions
//
// A mirror of PERMISSIONS in backend/_shared/auth.py, used only to show, hide
// or disable controls. The API re-checks every request, so this is a usability
// affordance and never a security boundary.
//
// A value may be `true`, `false`, or a scope string. Scopes are truthy: they
// mean "allowed, but only over certain rows".
// --------------------------------------------------------------------------

export const SCOPES = {
  ASSIGNED: 'assigned',
  TEAM: 'team',
  OWN: 'own',
};

export const ACTIONS = {
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_PROJECTS: 'view_projects',
  CREATE_PROJECTS: 'create_projects',
  EDIT_PROJECTS: 'edit_projects',
  DELETE_PROJECTS: 'delete_projects',
  MANAGE_DELIVERABLES: 'manage_deliverables',
  UPDATE_DELIVERABLES: 'update_deliverables',
  ASSIGN_EMPLOYEES: 'assign_employees',
  VIEW_ALLOCATION: 'view_allocation',
  VIEW_BUDGETS: 'view_budgets',
  MANAGE_BUDGETS: 'manage_budgets',
  MANAGE_USERS: 'manage_users',
  GENERATE_REPORTS: 'generate_reports',
};

const { ASSIGNED, TEAM, OWN } = SCOPES;

export const PERMISSIONS = {
  [ROLES.ADMIN]: {
    view_dashboard: true,
    view_projects: true,
    create_projects: true,
    edit_projects: true,
    delete_projects: true,
    manage_deliverables: true,
    update_deliverables: true,
    assign_employees: true,
    view_allocation: true,
    view_budgets: true,
    manage_budgets: true,
    manage_users: true,
    generate_reports: true,
  },
  [ROLES.PROJECT_MANAGER]: {
    view_dashboard: true,
    view_projects: true,
    create_projects: true,
    edit_projects: true,
    delete_projects: true,
    manage_deliverables: true,
    update_deliverables: true,
    assign_employees: true,
    view_allocation: true,
    view_budgets: true,
    manage_budgets: true,
    manage_users: false,
    generate_reports: true,
  },
  [ROLES.TEAM_LEADER]: {
    view_dashboard: true,
    view_projects: true,
    create_projects: false,
    edit_projects: ASSIGNED,
    delete_projects: false,
    manage_deliverables: true,
    update_deliverables: true,
    assign_employees: true,
    view_allocation: TEAM,
    view_budgets: true,
    manage_budgets: false,
    manage_users: false,
    generate_reports: TEAM,
  },
  [ROLES.EMPLOYEE]: {
    view_dashboard: OWN,
    view_projects: ASSIGNED,
    create_projects: false,
    edit_projects: false,
    delete_projects: false,
    manage_deliverables: false,
    update_deliverables: ASSIGNED,
    assign_employees: false,
    view_allocation: OWN,
    view_budgets: false,
    manage_budgets: false,
    manage_users: false,
    generate_reports: false,
  },
  [ROLES.STAKEHOLDER]: {
    view_dashboard: true,
    view_projects: true,
    create_projects: false,
    edit_projects: false,
    delete_projects: false,
    manage_deliverables: false,
    update_deliverables: false,
    assign_employees: false,
    view_allocation: true,
    view_budgets: true,
    manage_budgets: false,
    manage_users: false,
    generate_reports: true,
  },
};

// --------------------------------------------------------------------------
// Domain enums
// --------------------------------------------------------------------------

export const PROJECT_STATUS = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const PROJECT_STATUS_LABELS = {
  [PROJECT_STATUS.PLANNING]: 'Planning',
  [PROJECT_STATUS.ACTIVE]: 'Active',
  [PROJECT_STATUS.ON_HOLD]: 'On Hold',
  [PROJECT_STATUS.COMPLETED]: 'Completed',
  [PROJECT_STATUS.CANCELLED]: 'Cancelled',
};

export const PROJECT_STATUS_OPTIONS = Object.entries(PROJECT_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const DELIVERABLE_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const DELIVERABLE_STATUS_LABELS = {
  [DELIVERABLE_STATUS.NOT_STARTED]: 'Not Started',
  [DELIVERABLE_STATUS.IN_PROGRESS]: 'In Progress',
  [DELIVERABLE_STATUS.BLOCKED]: 'Blocked',
  [DELIVERABLE_STATUS.COMPLETED]: 'Completed',
  [DELIVERABLE_STATUS.CANCELLED]: 'Cancelled',
};

export const DELIVERABLE_STATUS_OPTIONS = Object.entries(DELIVERABLE_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/** Mirrors EXPENSE_CATEGORIES in backend/budgets/models.py. */
export const EXPENSE_CATEGORIES = [
  'labor',
  'tooling',
  'travel',
  'licensing',
  'hardware',
  'other',
];

export const EXPENSE_CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

/** Risk buckets returned by GET /reports/at-risk. */
export const RISK_LEVEL = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

/** MUI palette colour per status value, used by chips and bars. */
export const STATUS_COLOR = {
  [PROJECT_STATUS.PLANNING]: 'info',
  [PROJECT_STATUS.ACTIVE]: 'success',
  [PROJECT_STATUS.ON_HOLD]: 'warning',
  [PROJECT_STATUS.COMPLETED]: 'default',
  [PROJECT_STATUS.CANCELLED]: 'error',
  [DELIVERABLE_STATUS.NOT_STARTED]: 'default',
  [DELIVERABLE_STATUS.IN_PROGRESS]: 'info',
  [DELIVERABLE_STATUS.BLOCKED]: 'error',
  [RISK_LEVEL.LOW]: 'success',
  [RISK_LEVEL.MEDIUM]: 'warning',
  [RISK_LEVEL.HIGH]: 'error',
};

/** Where the tokens and cached user live between page loads. */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'pm.accessToken',
  REFRESH_TOKEN: 'pm.refreshToken',
  USER: 'pm.user',
};

/** Utilization at or above this fraction of capacity counts as over-allocated. */
export const OVER_ALLOCATION_THRESHOLD = 1.0;
