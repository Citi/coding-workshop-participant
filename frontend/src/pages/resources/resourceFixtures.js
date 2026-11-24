// Sample API data for the resources tests (shapes follow docs/API.md › Resources and Allocations).

export const list = (items) => ({ items, total: items.length })

const stamps = { created_at: '2026-11-01T10:00:00+00:00', updated_at: '2026-11-01T10:00:00+00:00' }

// Priya: Apollo (active) 60% + Zeus (active) 60% = 120%; Hermes is planned, so its 30% is not counted.
export const PRIYA = {
  ...stamps, id: 4, full_name: 'Priya Shah', email: 'priya@acme.com', job_title: 'Developer', department: 'IT',
  total_allocation_percent: 120, active_project_count: 2, is_over_allocated: true,
}
export const TOM = {
  ...stamps, id: 5, full_name: 'Tom Lee', email: 'tom@acme.com', job_title: 'QA Engineer', department: 'IT',
  total_allocation_percent: 40, active_project_count: 1, is_over_allocated: false,
}
export const MARIA = {
  ...stamps, id: 6, full_name: 'Maria Garcia', email: 'maria@acme.com', job_title: 'Business Analyst', department: 'Sales',
  total_allocation_percent: 0, active_project_count: 0, is_over_allocated: false,
}

/** GET /resources is sorted by full_name. */
export const RESOURCES = [MARIA, PRIYA, TOM]

export const APOLLO = { id: 1, name: 'Apollo CRM', status: 'active' }
export const ZEUS = { id: 2, name: 'Zeus ERP', status: 'active' }
export const HERMES = { id: 3, name: 'Hermes Portal', status: 'planned' }
export const PROJECTS = [APOLLO, HERMES, ZEUS]

const allocation = (id, resource, project, percent, total) => ({
  ...stamps,
  id,
  resource_id: resource.id,
  resource_name: resource.full_name,
  project_id: project.id,
  project_name: project.name,
  project_status: project.status,
  allocation_percent: percent,
  resource_total_allocation_percent: total,
  resource_over_allocated: total > 100,
})

export const PRIYA_APOLLO = allocation(3, PRIYA, APOLLO, 60, 120)
export const PRIYA_HERMES = allocation(8, PRIYA, HERMES, 30, 120)
export const PRIYA_ZEUS = allocation(7, PRIYA, ZEUS, 60, 120)
export const TOM_APOLLO = allocation(9, TOM, APOLLO, 40, 40)

/** GET /allocations?resource_id=4 (sorted by project name). */
export const PRIYA_ALLOCATIONS = [PRIYA_APOLLO, PRIYA_HERMES, PRIYA_ZEUS]
/** GET /allocations?project_id=1 (sorted by resource name). */
export const APOLLO_TEAM = [PRIYA_APOLLO, TOM_APOLLO]

const summary = ({ id, project_id, project_name, project_status, allocation_percent }) => ({
  id, project_id, project_name, project_status, allocation_percent,
})

/** GET /resources/4 */
export const PRIYA_DETAILS = { ...PRIYA, allocations: PRIYA_ALLOCATIONS.map(summary) }
/** GET /resources/5 */
export const TOM_DETAILS = { ...TOM, allocations: [summary(TOM_APOLLO)] }
