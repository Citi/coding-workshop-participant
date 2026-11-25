// Allocation (resource <-> project, %) form config, request body and texts, mirroring docs/API.md › Allocations.
import { formatPercent } from '../../utils/format'
import { labelFor } from '../../utils/labels'
import { isBlank } from '../../utils/validators'
import { byLabel, includeOption } from '../../utils/options'

/** The API only accepts whole percentages (JSON integers 1-100). */
export const wholeNumber = (value) => (isBlank(value) || Number.isInteger(Number(value)) ? undefined : 'Must be a whole number')

/** "Priya Shah (120% allocated)" - shows who still has capacity while picking a person. */
export function resourceOption(resource) {
  return { value: resource.id, label: `${resource.full_name} (${formatPercent(resource.total_allocation_percent ?? 0)} allocated)` }
}

/** "Apollo CRM (Active)" - only allocations to active projects count towards a person's total. */
export function projectOption(project) {
  return { value: project.id, label: `${project.name} (${labelFor('project', project.status)})` }
}

/** Query for GET /allocations: one project's team, one person's projects, or everything. */
export function allocationQuery({ projectId, resourceId } = {}) {
  const query = {}
  if (projectId) query.project_id = projectId
  if (resourceId) query.resource_id = resourceId
  return query
}

/**
 * Fields for creating/editing an allocation.
 * options: { resources, projects } loaded when the form opens.
 * context:
 *  - allocation: the record being edited (omit for a new one)
 *  - resourceId / projectId: that select is fixed (the panel lists one person's or one project's allocations)
 *  - existing: the allocations already listed; as the API allows one allocation per person per
 *    project, people already on the fixed project (or projects the fixed person is already on) are left out
 */
export function allocationFields({ resources, projects }, { allocation, resourceId, projectId, existing = [] } = {}) {
  const others = existing.filter((row) => row.id !== allocation?.id)
  const takenResources = new Set(projectId ? others.map((row) => row.resource_id) : [])
  const takenProjects = new Set(resourceId ? others.map((row) => row.project_id) : [])

  const resourceOptions = includeOption(
    resources.filter((resource) => !takenResources.has(resource.id)).map(resourceOption).sort(byLabel),
    resourceId ?? allocation?.resource_id,
    allocation?.resource_name ?? `Resource #${resourceId}`,
  )
  const projectOptions = includeOption(
    projects.filter((project) => !takenProjects.has(project.id)).map(projectOption).sort(byLabel),
    projectId ?? allocation?.project_id,
    allocation?.project_name ?? `Project #${projectId}`,
  )

  return [
    {
      name: 'resource_id',
      label: 'Team member',
      type: 'select',
      required: true,
      options: resourceOptions,
      disabled: Boolean(resourceId),
      helperText: takenResources.size ? 'People already on this project are not listed. Edit their allocation instead.' : undefined,
    },
    {
      name: 'project_id',
      label: 'Project',
      type: 'select',
      required: true,
      options: projectOptions,
      disabled: Boolean(projectId),
      helperText: takenProjects.size ? 'Projects this person is already on are not listed. Edit that allocation instead.' : undefined,
    },
    {
      name: 'allocation_percent',
      label: 'Allocation (%)',
      type: 'number',
      required: true,
      min: 1,
      max: 100,
      step: 1,
      validate: wholeNumber,
      helperText: 'Share of their working time on this project, from 1 to 100',
    },
  ]
}

/** Initial values: the record being edited, or the fixed person/project for a new allocation. */
export function initialAllocationValues(allocation, { resourceId, projectId } = {}) {
  return allocation || { resource_id: resourceId, project_id: projectId }
}

/** FormDialog values -> POST/PUT body (full update; the API wants JSON integers). */
export function toAllocationPayload(values) {
  return {
    resource_id: Number(values.resource_id),
    project_id: Number(values.project_id),
    allocation_percent: Number(values.allocation_percent),
  }
}

/** Short explanation at the top of the form, depending on what is fixed. */
export function allocationFormDescription({ resourceId, projectId } = {}) {
  if (projectId && !resourceId) return 'Add a team member to this project. Each name shows their current total across active projects.'
  if (resourceId && !projectId) return 'Allocate this person to a project. Only allocations to active projects count towards their total.'
  return 'Allocate a team member to a project. Only allocations to active projects count towards their total.'
}

/** "Priya Shah on Apollo CRM" - names an allocation in buttons and dialogs. */
export function allocationLabel(allocation) {
  return `${allocation.resource_name} on ${allocation.project_name}`
}

/** Delete confirmation: nothing else is removed, the person's total is recalculated. */
export function deleteAllocationMessage(allocation) {
  return (
    `${allocation.resource_name} will no longer be allocated to ${allocation.project_name} ` +
    `(${formatPercent(allocation.allocation_percent)}). Their total allocation is recalculated; ` +
    'deliverables they own are not changed. This cannot be undone.'
  )
}
