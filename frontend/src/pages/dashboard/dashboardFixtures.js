// Sample GET /dashboard responses for the dashboard tests (shape: docs/API.md › Dashboard).
// The snapshot was taken on 2026-11-24 (UTC), so due-date wording is the same on any day the tests run.

export const GENERATED_AT = '2026-11-24T12:00:00+00:00'

/** ProjectSummary */
export function makeProjectSummary(overrides = {}) {
  return {
    id: 1,
    name: 'Apollo CRM',
    department: 'Sales',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    progress_percent: 40,
    health: 'at_risk',
    health_reasons: ['1 deliverable(s) overdue', '1 deliverable(s) blocked'],
    budget: 150000,
    budget_spent: 61000,
    budget_used_percent: 40.7,
    over_budget: false,
    team_size: 3,
    ...overrides,
  }
}

/** DeliverableSummary */
export function makeDeliverableSummary(overrides = {}) {
  return {
    id: 10,
    name: 'Requirements sign-off',
    project_id: 1,
    project_name: 'Apollo CRM',
    status: 'in_progress',
    due_date: '2026-11-21',
    is_key: true,
    owner_name: 'Priya Shah',
    is_overdue: true,
    ...overrides,
  }
}

/** An active project that is at risk (overdue and blocked deliverables). */
export const APOLLO = makeProjectSummary()

/** An active project past its end date and over budget. */
export const HERMES = makeProjectSummary({
  id: 3,
  name: 'Hermes Payments',
  department: 'Finance',
  start_date: '2026-02-01',
  end_date: '2026-10-31',
  progress_percent: 70,
  health: 'overdue',
  health_reasons: ['End date 2026-10-31 has passed'],
  budget: 80000,
  budget_spent: 86000,
  budget_used_percent: 107.5,
  over_budget: true,
  team_size: 1,
})

/** An active, on-track project that spent money against a zero budget. */
export const ZEUS = makeProjectSummary({
  id: 2,
  name: 'Zeus ERP',
  department: 'IT',
  start_date: '2026-06-01',
  end_date: '2027-03-31',
  progress_percent: 55,
  health: 'on_track',
  health_reasons: [],
  budget: 0,
  budget_spent: 500,
  budget_used_percent: null,
  over_budget: true,
  team_size: 4,
})

export const SIGN_OFF = makeDeliverableSummary()
export const VENDOR = makeDeliverableSummary({
  id: 7, name: 'Vendor contract', project_id: 3, project_name: 'Hermes Payments', due_date: '2026-11-10', is_key: false, owner_name: null,
})
export const PERMITS = makeDeliverableSummary({
  id: 8, name: 'Site permits', project_id: 2, project_name: 'Zeus ERP', status: 'blocked', due_date: '2026-11-23', is_key: false, owner_name: 'Tom Lee',
})
export const REVIEW = makeDeliverableSummary({
  id: 16, name: 'Design review', status: 'not_started', due_date: '2026-11-24', is_key: false, is_overdue: false,
})
export const GO_LIVE = makeDeliverableSummary({
  id: 14, name: 'Payments go-live', project_id: 3, project_name: 'Hermes Payments', status: 'blocked', due_date: '2026-11-25', owner_name: null, is_overdue: false,
})
export const TRAINING = makeDeliverableSummary({
  id: 17, name: 'Staff training', project_id: 2, project_name: 'Zeus ERP', status: 'not_started', due_date: '2026-12-01', is_key: false, owner_name: 'Tom Lee', is_overdue: false,
})
export const UAT = makeDeliverableSummary({
  id: 15, name: 'User acceptance testing', project_id: 2, project_name: 'Zeus ERP', status: 'not_started', due_date: '2026-12-15', owner_name: 'Tom Lee', is_overdue: false,
})

export const PRIYA = {
  id: 4,
  full_name: 'Priya Shah',
  job_title: 'Developer',
  department: 'IT',
  total_allocation_percent: 120,
  allocations: [
    { project_id: 1, project_name: 'Apollo CRM', allocation_percent: 60 },
    { project_id: 3, project_name: 'Hermes Payments', allocation_percent: 60 },
  ],
}
export const TOM = {
  id: 5,
  full_name: 'Tom Lee',
  job_title: 'QA Engineer',
  department: 'IT',
  total_allocation_percent: 110,
  allocations: [
    { project_id: 1, project_name: 'Apollo CRM', allocation_percent: 60 },
    { project_id: 2, project_name: 'Zeus ERP', allocation_percent: 50 },
  ],
}

/** BudgetLine of budget_by_project for a project summary. */
export function budgetLine(project, overrides = {}) {
  return {
    project_id: project.id,
    project_name: project.name,
    status: project.status,
    budget: project.budget,
    budget_spent: project.budget_spent,
    budget_remaining: project.budget - project.budget_spent,
    budget_used_percent: project.budget_used_percent,
    over_budget: project.over_budget,
    ...overrides,
  }
}

/** A planned project that has used 85% of its budget (not active, so only in the budget list). */
export const ORION_BUDGET = {
  project_id: 6, project_name: 'Orion Analytics', status: 'planned', budget: 20000, budget_spent: 17000,
  budget_remaining: 3000, budget_used_percent: 85, over_budget: false,
}

/** 5 projects: Apollo (at risk), Hermes (overdue), Zeus (on track), Orion (planned) and one cancelled. */
export function makeDashboard(overrides = {}) {
  return {
    generated_at: GENERATED_AT,
    projects: {
      total: 5,
      by_status: { planned: 1, active: 3, on_hold: 0, completed: 0, cancelled: 1 },
      by_health: { on_track: 2, at_risk: 1, overdue: 1 },
    },
    active_projects: [HERMES, APOLLO, ZEUS],
    at_risk_projects: [HERMES, APOLLO],
    deliverables: { total: 20, completed: 6, overdue: 3, blocked: 2, key_total: 4, key_completed: 1 },
    key_deliverables: [SIGN_OFF, GO_LIVE, UAT],
    upcoming_deliverables: [REVIEW, GO_LIVE, TRAINING],
    overdue_deliverables: [VENDOR, SIGN_OFF, PERMITS],
    resources: { total: 15, over_allocated: 2 },
    over_allocated_resources: [PRIYA, TOM],
    budget: { total_planned: 250000, total_spent: 164500, used_percent: 65.8, over_budget_projects: 2 },
    budget_by_project: [budgetLine(ZEUS), budgetLine(HERMES), ORION_BUDGET, budgetLine(APOLLO)],
    ...overrides,
  }
}

/** A brand-new installation: no projects, deliverables, people or budget yet. */
export const EMPTY_DASHBOARD = {
  generated_at: GENERATED_AT,
  projects: {
    total: 0,
    by_status: { planned: 0, active: 0, on_hold: 0, completed: 0, cancelled: 0 },
    by_health: { on_track: 0, at_risk: 0, overdue: 0 },
  },
  active_projects: [],
  at_risk_projects: [],
  deliverables: { total: 0, completed: 0, overdue: 0, blocked: 0, key_total: 0, key_completed: 0 },
  key_deliverables: [],
  upcoming_deliverables: [],
  overdue_deliverables: [],
  resources: { total: 0, over_allocated: 0 },
  over_allocated_resources: [],
  budget: { total_planned: 0, total_spent: 0, used_percent: 0, over_budget_projects: 0 },
  budget_by_project: [],
}
