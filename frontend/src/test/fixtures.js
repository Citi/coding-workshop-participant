/** Shared API fixtures for page tests. */
export const project = {
  id: 7,
  name: 'Portal',
  description: 'Rebuild the portal',
  manager_id: 2,
  manager_name: 'Maria Lopez',
  start_date: '2026-09-01',
  estimated_end_date: '2026-12-31',
  budget: 100000,
  budget_allocated: 60000,
  status: 'active',
  is_overdue: false,
  archived_at: null,
  member_count: 2,
  total_hours: 48,
  planned_hours: 1360,
  working_days: 85,
  milestone_count: 1,
  milestones_completed: 0,
  can_manage: true,
  can_archive: false,
  can_log_time: true,
  my_hours: 0,
  members: [
    {
      id: 4, name: 'Aisha Patel', job_title: 'Engineer', manager_id: 2, manager_name: 'Maria Lopez', hours: 40, days: 5, planned_hours: 680, on_manager_team: true,
    },
    {
      id: 6, name: 'Sam Okafor', job_title: 'QA', manager_id: 3, manager_name: 'David Chen', hours: 8, days: 1, planned_hours: 680, on_manager_team: false,
    },
  ],
  milestones: [{
    id: 11, name: 'MVP', description: '', start_date: '2026-09-01', end_date: '2026-10-30', budget: 60000,
    status: 'in_progress', total_hours: 48, is_overdue: false, members: [{ id: 4, name: 'Aisha Patel' }],
  }],
};

export const entries = {
  entries: [{
    id: 21, project_id: 7, project_name: 'Portal', user_id: 4, user_name: 'Aisha Patel', milestone_id: 11,
    milestone_name: 'MVP', work_date: '2026-10-12', hours: 8, note: 'Built login',
  }],
  summary: {
    total_hours: 8, total_days: 1, by_user: [{ user_id: 4, user_name: 'Aisha Patel', hours: 8 }],
    by_project: [{ project_id: 7, project_name: 'Portal', hours: 8 }],
  },
};

export const employees = [
  { id: 4, name: 'Aisha Patel', role: 'employee', job_title: 'Engineer', manager_id: 2, manager_name: 'Maria Lopez', email: 'a@x.com', project_count: 1, total_hours: 40 },
  { id: 5, name: 'Jordan Smith', role: 'employee', job_title: 'Analyst', manager_id: 2, manager_name: 'Maria Lopez', email: 'j@x.com', project_count: 0, total_hours: 0 },
  { id: 6, name: 'Sam Okafor', role: 'employee', job_title: 'QA', manager_id: 3, manager_name: 'David Chen', email: 's@x.com', project_count: 1, total_hours: 8 },
  { id: 8, name: 'Lena Novak', role: 'employee', job_title: 'Designer', manager_id: 3, manager_name: 'David Chen', email: 'l@x.com', project_count: 0, total_hours: 0 },
];
