// FormDialog field config and FilterBar config for deliverables (rules mirror docs/API.md).
import { optionsFor } from '../../utils/labels'
import { selfAndDependentIds } from './deliverableUtils'
import { includeOption } from '../../utils/options'

export const NAME_MAX_LENGTH = 150
export const DESCRIPTION_MAX_LENGTH = 5000

const byLabel = (a, b) => a.label.localeCompare(b.label)

/** Prerequisite choices labelled "name (project)", without the deliverable itself or anything downstream of it. */
export function dependencyOptions(deliverables, deliverable) {
  const excluded = deliverable ? selfAndDependentIds(deliverables, deliverable.id) : new Set()
  return deliverables
    .filter((item) => !excluded.has(item.id))
    .map((item) => ({ value: item.id, label: `${item.name} (${item.project_name})` }))
    .sort(byLabel)
}

/**
 * Fields for creating/editing a deliverable.
 * options: { projects, resources, deliverables } loaded when the form opens.
 * deliverable: the record being edited (omit for a new one); fixedProject: project select is locked.
 */
export function deliverableFields({ projects, resources, deliverables }, { deliverable, fixedProject = false } = {}) {
  const projectOptions = includeOption(
    projects.map((project) => ({ value: project.id, label: project.name })),
    deliverable?.project_id,
    deliverable?.project_name,
  )
  const ownerOptions = includeOption(
    resources.map((resource) => ({ value: resource.id, label: resource.full_name })),
    deliverable?.owner_id,
    deliverable?.owner_name,
  )
  return [
    { name: 'project_id', label: 'Project', type: 'select', required: true, options: projectOptions, disabled: fixedProject },
    { name: 'name', label: 'Name', required: true, maxLength: NAME_MAX_LENGTH, autoFocus: true },
    { name: 'description', label: 'Description', type: 'textarea', maxLength: DESCRIPTION_MAX_LENGTH },
    { name: 'status', label: 'Status', type: 'select', required: true, options: optionsFor('deliverable'), half: true },
    { name: 'due_date', label: 'Due date', type: 'date', required: true, half: true },
    { name: 'owner_id', label: 'Owner', type: 'select', options: ownerOptions, half: true },
    { name: 'is_key', label: 'Key deliverable', type: 'checkbox', half: true, helperText: 'Highlighted on the dashboard and in reports' },
    {
      name: 'depends_on_ids',
      label: 'Depends on',
      type: 'multiselect',
      options: dependencyOptions(deliverables, deliverable),
      helperText: deliverable
        ? 'Prerequisites that must be completed first. Deliverables that depend on this one are not listed (that would create a cycle).'
        : 'Prerequisites that must be completed first',
    },
  ]
}

/** Initial values: the record being edited, or defaults for a new deliverable. */
export function initialDeliverableValues(deliverable, projectId) {
  if (deliverable) return deliverable
  return { project_id: projectId ?? '', status: 'not_started', is_key: false, depends_on_ids: [] }
}

/** FilterBar config. The project select is left out when the list is fixed to one project. */
export function deliverableFilters({ projectOptions } = {}) {
  return [
    ...(projectOptions ? [{ name: 'project_id', label: 'Project', options: projectOptions }] : []),
    { name: 'status', label: 'Status', options: optionsFor('deliverable') },
    { name: 'is_key', label: 'Key deliverables only', type: 'toggle' },
    { name: 'overdue', label: 'Overdue only', type: 'toggle' },
  ]
}
