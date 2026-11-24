/**
 * API responses used by the portfolio page tests. Shapes and values follow the live API with
 * the spec section 10 seed (as of 2026-11-24), trimmed to what the tests need.
 */

export const DEPARTMENTS = Object.freeze({
  items: [
    { id: 1, name: 'Engineering', created_at: '2026-11-24T17:26:22Z' },
    { id: 2, name: 'Marketing', created_at: '2026-11-24T17:26:22Z' },
    { id: 4, name: 'Operations', created_at: '2026-11-24T17:26:22Z' },
  ],
  total: 3,
});

export const PROJECTS = Object.freeze({
  items: [
    { id: 1, project_name: 'Project Alpha: Customer Payments Platform', department_id: 1 },
    { id: 2, project_name: 'Project Beta: Brand Relaunch Campaign', department_id: 2 },
    { id: 4, project_name: 'Project Delta: Warehouse Tracking Rollout', department_id: 4 },
  ],
  total: 3,
});

const user = (id, name, email, role, departmentId, departmentName) => ({
  id,
  name,
  email,
  role,
  department_id: departmentId,
  department_name: departmentName,
  created_at: '2026-11-24T17:26:22Z',
});

export const USERS = Object.freeze({
  items: [
    user(1, 'Asha Rao', 'admin@acme.example', 'ADMIN', 1, 'Engineering'),
    user(2, 'Vikram Shah', 'pm@acme.example', 'PM', 1, 'Engineering'),
    user(5, 'Priya Nair', 'priya.nair@acme.example', 'LEAD', 1, 'Engineering'),
    user(6, 'Arjun Mehta', 'arjun.mehta@acme.example', 'LEAD', null, null),
  ],
  total: 4,
});

const deliverable = (fields) => ({
  description: null,
  start_date: null,
  blocked_reason: null,
  is_overdue: false,
  created_at: '2026-11-24T17:26:22Z',
  updated_at: '2026-11-24T17:26:22Z',
  ...fields,
});

export const DELIVERABLES = Object.freeze({
  items: [
    deliverable({
      id: 2,
      project_id: 1,
      project_name: 'Project Alpha: Customer Payments Platform',
      title: 'API Schema',
      assigned_user_id: 5,
      assigned_user_name: 'Priya Nair',
      due_date: '2026-11-19',
      completion_percentage: 40,
      status: 'BLOCKED',
      blocked_reason: 'Awaiting security approval of the partner data contract',
      is_overdue: true,
    }),
    deliverable({
      id: 3,
      project_id: 1,
      project_name: 'Project Alpha: Customer Payments Platform',
      title: 'Payments Service Integration',
      assigned_user_id: 6,
      assigned_user_name: 'Arjun Mehta',
      due_date: '2026-12-04',
      completion_percentage: 20,
      status: 'IN_PROGRESS',
    }),
    deliverable({
      id: 7,
      project_id: 2,
      project_name: 'Project Beta: Brand Relaunch Campaign',
      title: 'Brand Guidelines',
      assigned_user_id: null,
      assigned_user_name: null,
      due_date: '2026-11-04',
      completion_percentage: 100,
      status: 'DONE',
    }),
  ],
  total: 3,
});

export const CAPACITY = Object.freeze({
  as_of: '2026-11-24',
  over_allocated_count: 1,
  employees: [
    {
      user_id: 6,
      user_name: 'Arjun Mehta',
      department_id: 1,
      peak_load: 60,
      current_load: 60,
      status: 'AVAILABLE',
      segments: [
        { start_date: '2026-11-04', end_date: '2026-12-03', load: 60, allocation_ids: [4] },
        { start_date: '2026-12-04', end_date: '2027-01-03', load: 60, allocation_ids: [5] },
      ],
      conflicts: [],
      is_compound_bottleneck: false,
      bottleneck_deliverables: [],
    },
    {
      user_id: 5,
      user_name: 'Priya Nair',
      department_id: 1,
      peak_load: 120,
      current_load: 120,
      status: 'OVER_ALLOCATED',
      segments: [
        { start_date: '2026-11-14', end_date: '2026-11-21', load: 60, allocation_ids: [1] },
        { start_date: '2026-11-22', end_date: '2026-12-06', load: 120, allocation_ids: [1, 2] },
        { start_date: '2026-12-07', end_date: '2026-12-14', load: 60, allocation_ids: [1] },
      ],
      conflicts: [
        {
          start_date: '2026-11-22',
          end_date: '2026-12-06',
          load: 120,
          allocations: [
            {
              id: 1,
              project_id: 1,
              project_name: 'Project Alpha: Customer Payments Platform',
              deliverable_id: 2,
              deliverable_title: 'API Schema',
              allocation_percentage: 60,
              start_date: '2026-11-14',
              end_date: '2026-12-14',
            },
            {
              id: 2,
              project_id: 2,
              project_name: 'Project Beta: Brand Relaunch Campaign',
              deliverable_id: null,
              deliverable_title: null,
              allocation_percentage: 60,
              start_date: '2026-11-22',
              end_date: '2026-12-06',
            },
          ],
        },
      ],
      is_compound_bottleneck: true,
      bottleneck_deliverables: [{ id: 2, title: 'API Schema', project_id: 1 }],
    },
  ],
});

const allocation = (fields) => ({ created_at: '2026-11-24T17:26:22Z', ...fields });

export const ALLOCATIONS = Object.freeze({
  items: [
    allocation({
      id: 1,
      user_id: 5,
      user_name: 'Priya Nair',
      project_id: 1,
      project_name: 'Project Alpha: Customer Payments Platform',
      deliverable_id: 2,
      deliverable_title: 'API Schema',
      allocation_percentage: 60,
      start_date: '2026-11-14',
      end_date: '2026-12-14',
    }),
    allocation({
      id: 2,
      user_id: 5,
      user_name: 'Priya Nair',
      project_id: 2,
      project_name: 'Project Beta: Brand Relaunch Campaign',
      deliverable_id: null,
      deliverable_title: null,
      allocation_percentage: 60,
      start_date: '2026-11-22',
      end_date: '2026-12-06',
    }),
  ],
  total: 2,
});

const factor = (key, label, points, maxPoints) => ({ key, label, points, max_points: maxPoints, detail: '' });

export const RISK = Object.freeze({
  as_of: '2026-11-24',
  items: [
    {
      project_id: 1,
      project_name: 'Project Alpha: Customer Payments Platform',
      department_name: 'Engineering',
      status: 'ACTIVE',
      risk_score: 78,
      risk_level: 'CRITICAL',
      factors: [
        factor('schedule', 'Schedule', 16, 20),
        factor('blocked', 'Blocked deliverables', 10, 15),
        factor('blast_radius', 'Dependency blast radius', 15, 20),
        factor('resource', 'Resource over-allocation', 12, 15),
        factor('budget', 'Budget vs progress', 15, 20),
        factor('deadline', 'Deadline proximity', 10, 10),
      ],
      headline: "2 deliverables are overdue: 'API Schema' (due 2026-11-19, 5 days late) and 'Data Migration Plan'.",
    },
    {
      project_id: 4,
      project_name: 'Project Delta: Warehouse Tracking Rollout',
      department_name: 'Operations',
      status: 'ACTIVE',
      risk_score: 61,
      risk_level: 'HIGH',
      factors: [factor('budget', 'Budget vs progress', 20, 20), factor('schedule', 'Schedule', 16, 20)],
      headline: '105.0% of the planned budget is consumed while deliverables are 55.0% complete.',
    },
    {
      project_id: 2,
      project_name: 'Project Beta: Brand Relaunch Campaign',
      department_name: 'Marketing',
      status: 'ACTIVE',
      risk_score: 31,
      risk_level: 'MEDIUM',
      factors: [factor('schedule', 'Schedule', 8, 20)],
      headline: "'Campaign Creative' (4 days overdue) puts 2 downstream deliverables in this project at risk.",
    },
    {
      project_id: 5,
      project_name: 'Project Epsilon: Onboarding Portal',
      department_name: 'Human Resources',
      status: 'COMPLETED',
      risk_score: 0,
      risk_level: 'LOW',
      factors: [factor('schedule', 'Schedule', 0, 20)],
      headline: 'Project is COMPLETED, so its delivery risk is not scored.',
    },
  ],
});

export const BUDGET = Object.freeze({
  as_of: '2026-11-24',
  projects: [
    {
      project_id: 1,
      project_name: 'Project Alpha: Customer Payments Platform',
      department_id: 1,
      department_name: 'Engineering',
      status: 'ACTIVE',
      planned_budget: '400000.00',
      actual_spend: '300000.00',
      remaining: '100000.00',
      utilization_pct: 75.0,
      completion_pct: 35.0,
      divergence_pp: 40.0,
    },
    {
      project_id: 3,
      project_name: 'Project Gamma: Ledger Automation',
      department_id: 3,
      department_name: 'Finance',
      status: 'ACTIVE',
      planned_budget: '250000.00',
      actual_spend: '137500.00',
      remaining: '112500.00',
      utilization_pct: 55.0,
      completion_pct: 60.0,
      divergence_pp: -5.0,
    },
    {
      project_id: 4,
      project_name: 'Project Delta: Warehouse Tracking Rollout',
      department_id: 4,
      department_name: 'Operations',
      status: 'ACTIVE',
      planned_budget: '200000.00',
      actual_spend: '210000.00',
      remaining: '-10000.00',
      utilization_pct: 105.0,
      completion_pct: 55.0,
      divergence_pp: 50.0,
    },
  ],
  departments: [
    {
      department_id: 1,
      department_name: 'Engineering',
      planned_budget: '400000.00',
      actual_spend: '300000.00',
      remaining: '100000.00',
      utilization_pct: 75.0,
      completion_pct: 35.0,
    },
    {
      department_id: 4,
      department_name: 'Operations',
      planned_budget: '200000.00',
      actual_spend: '210000.00',
      remaining: '-10000.00',
      utilization_pct: 105.0,
      completion_pct: 55.0,
    },
  ],
  totals: { planned_budget: '850000.00', actual_spend: '647500.00', remaining: '202500.00', utilization_pct: 76.2 },
});

export const AUDIT_LOGS = Object.freeze({
  items: [
    {
      id: 12,
      actor_id: 2,
      actor_email: 'pm@acme.example',
      entity_type: 'deliverable',
      entity_id: 2,
      action: 'UPDATE',
      before_state: {
        id: 2,
        title: 'API Schema',
        status: 'BLOCKED',
        completion_percentage: 40,
        updated_at: '2026-11-24T17:26:22Z',
      },
      after_state: {
        id: 2,
        title: 'API Schema',
        status: 'IN_PROGRESS',
        completion_percentage: 50,
        updated_at: '2026-11-24T18:00:00Z',
      },
      created_at: '2026-11-24T18:00:00Z',
    },
    {
      id: 11,
      actor_id: 1,
      actor_email: 'admin@acme.example',
      entity_type: 'department',
      entity_id: 9,
      action: 'CREATE',
      before_state: null,
      after_state: { id: 9, name: 'Legal', created_at: '2026-11-24T17:50:00Z' },
      created_at: '2026-11-24T17:50:00Z',
    },
  ],
  total: 2,
});
