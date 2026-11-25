import { countLabel } from '../../utils/text'
// Resource (team member) form config, request body, delete text and filters, mirroring docs/API.md › Resources.

export const RESOURCE_FIELDS = [
  { name: 'full_name', label: 'Full name', required: true, maxLength: 120, autoFocus: true },
  { name: 'email', label: 'Email', type: 'email', required: true, maxLength: 255 },
  { name: 'job_title', label: 'Job title', required: true, maxLength: 100, half: true },
  { name: 'department', label: 'Department', required: true, maxLength: 100, half: true },
]

const text = (value) => String(value ?? '').trim()

/** FormDialog values -> POST/PUT body. PUT is a full update, so every stored field is sent. */
export function toResourcePayload(values) {
  return {
    full_name: text(values.full_name),
    email: text(values.email),
    job_title: text(values.job_title),
    department: text(values.department),
  }
}

/** Delete confirmation: the API also removes the person's allocations and unassigns their deliverables. */
export function deleteResourceMessage(resource) {
  const staffing = resource.active_project_count
    ? ` (they are currently on ${countLabel(resource.active_project_count, 'active project')})`
    : ''
  return (
    `"${resource.full_name}" will be permanently deleted. All of their project allocations will be removed${staffing} ` +
    'and any deliverables they own will become unassigned. This cannot be undone.'
  )
}

/** FilterBar config (the search box is built in). Department options come from the loaded data. */
export function resourceFilters(departmentOptions) {
  return [
    { name: 'department', label: 'Department', options: departmentOptions },
    { name: 'over_allocated', label: 'Over-allocated only', type: 'toggle' },
  ]
}
