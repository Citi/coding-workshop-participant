// Sample API data for the deliverables tests (shapes follow docs/API.md).

export const list = (items) => ({ items, total: items.length })

export const PROJECTS = [
  { id: 1, name: 'Apollo CRM', status: 'active' },
  { id: 2, name: 'Zeus ERP', status: 'active' },
]

export const RESOURCES = [
  { id: 4, full_name: 'Priya Shah', job_title: 'Developer', department: 'IT' },
  { id: 5, full_name: 'Tom Lee', job_title: 'QA Engineer', department: 'IT' },
]

const stamps = { created_at: '2026-11-01T10:00:00+00:00', updated_at: '2026-11-01T10:00:00+00:00' }

export const VENDOR = {
  ...stamps, id: 7, project_id: 2, project_name: 'Zeus ERP', name: 'Vendor contract', description: '',
  status: 'in_progress', due_date: '2026-01-10', is_key: false, owner_id: null, owner_name: null, is_overdue: true, depends_on_ids: [],
}
export const INTERVIEWS = {
  ...stamps, id: 8, project_id: 1, project_name: 'Apollo CRM', name: 'Stakeholder interviews', description: '',
  status: 'completed', due_date: '2026-02-01', is_key: false, owner_id: null, owner_name: null, is_overdue: false, depends_on_ids: [],
}
export const DATA_AUDIT = {
  ...stamps, id: 9, project_id: 2, project_name: 'Zeus ERP', name: 'Data audit', description: '',
  status: 'blocked', due_date: '2026-12-20', is_key: false, owner_id: 5, owner_name: 'Tom Lee', is_overdue: false, depends_on_ids: [7],
}
export const SIGN_OFF = {
  ...stamps, id: 10, project_id: 1, project_name: 'Apollo CRM', name: 'Requirements sign-off', description: 'Scope agreed with sales',
  status: 'in_progress', due_date: '2026-03-01', is_key: true, owner_id: 4, owner_name: 'Priya Shah', is_overdue: true, depends_on_ids: [8, 9],
}
export const BUILD = {
  ...stamps, id: 12, project_id: 1, project_name: 'Apollo CRM', name: 'Build MVP', description: '',
  status: 'not_started', due_date: '2027-01-15', is_key: false, owner_id: 4, owner_name: 'Priya Shah', is_overdue: false, depends_on_ids: [10],
}

export const DELIVERABLES = [VENDOR, INTERVIEWS, SIGN_OFF, DATA_AUDIT, BUILD]

const related = ({ id, name, status, due_date, project_id, project_name }) => ({ id, name, status, due_date, project_id, project_name })

/** GET /deliverables/10 - the chain is deliberately not in display order. */
export const SIGN_OFF_DETAILS = {
  ...SIGN_OFF,
  depends_on: [related(INTERVIEWS), related(DATA_AUDIT)],
  dependency_chain: [{ ...related(VENDOR), depth: 2 }, { ...related(DATA_AUDIT), depth: 1 }, { ...related(INTERVIEWS), depth: 1 }],
  blocks: [related(BUILD)],
}

/** GET /deliverables/12 */
export const BUILD_DETAILS = {
  ...BUILD,
  depends_on: [related(SIGN_OFF)],
  dependency_chain: [
    { ...related(SIGN_OFF), depth: 1 },
    { ...related(INTERVIEWS), depth: 2 },
    { ...related(DATA_AUDIT), depth: 2 },
    { ...related(VENDOR), depth: 3 },
  ],
  blocks: [],
}
