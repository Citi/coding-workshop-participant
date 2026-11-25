// Test data for the projects tests: the API's project object (docs/API.md › Projects).

export function makeProject(overrides = {}) {
  return {
    id: 1,
    name: 'Apollo CRM',
    description: 'Replace the legacy CRM',
    department: 'Sales',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    budget: 150000,
    created_at: '2026-01-01T09:00:00+00:00',
    updated_at: '2026-01-01T09:00:00+00:00',
    progress_percent: 40,
    deliverables_total: 5,
    deliverables_completed: 2,
    deliverables_overdue: 1,
    deliverables_blocked: 0,
    key_deliverables_total: 2,
    key_deliverables_completed: 1,
    team_size: 3,
    health: 'at_risk',
    health_reasons: ['1 deliverable(s) overdue'],
    budget_spent: 61000,
    budget_remaining: 89000,
    budget_used_percent: 40.7,
    over_budget: false,
    ...overrides,
  }
}

/** An active, at-risk project in Sales. */
export const APOLLO = makeProject()

/** A completed IT project (no health) that spent money against a zero budget. */
export const ZEUS = makeProject({
  id: 2,
  name: 'Zeus Portal',
  description: '',
  department: 'IT',
  status: 'completed',
  start_date: '2025-03-01',
  end_date: '2025-09-30',
  budget: 0,
  progress_percent: 100,
  deliverables_total: 1,
  deliverables_completed: 1,
  deliverables_overdue: 0,
  key_deliverables_total: 0,
  key_deliverables_completed: 0,
  team_size: 1,
  health: null,
  health_reasons: [],
  budget_spent: 500,
  budget_remaining: -500,
  budget_used_percent: null,
  over_budget: true,
})

/** GET /projects response body. */
export function listOf(...projects) {
  return { items: projects, total: projects.length }
}
