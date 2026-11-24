// Project create/edit form (FormDialog config) and request helpers, mirroring docs/API.md › Projects.
import { todayIso } from '../../utils/format'
import { optionsFor } from '../../utils/labels'
import { maxTwoDecimals, notBefore } from '../../utils/validators'
import { countLabel } from '../../utils/text'

export const MAX_BUDGET = 999999999999.99

export const PROJECT_FIELDS = [
  { name: 'name', label: 'Name', required: true, maxLength: 150, autoFocus: true },
  { name: 'department', label: 'Department', required: true, maxLength: 100, half: true },
  { name: 'status', label: 'Status', type: 'select', required: true, options: optionsFor('project'), half: true },
  { name: 'start_date', label: 'Start date', type: 'date', required: true, half: true },
  { name: 'end_date', label: 'End date', type: 'date', required: true, half: true, validate: notBefore('start_date', 'the start date') },
  {
    name: 'budget',
    label: 'Budget (USD)',
    type: 'number',
    min: 0,
    max: MAX_BUDGET,
    validate: maxTwoDecimals,
    helperText: 'Planned budget. Leave empty for 0.',
    half: true,
  },
  { name: 'description', label: 'Description', type: 'textarea', maxLength: 5000 },
]

/** Starting values for a new project (the API defaults status to planned). */
export function newProjectValues() {
  return { status: 'planned', start_date: todayIso() }
}

/** FormDialog values -> POST/PUT body. PUT is a full update, so every stored field is sent. */
export function toProjectPayload(values) {
  return {
    name: values.name,
    description: values.description ?? '',
    department: values.department,
    status: values.status,
    start_date: values.start_date,
    end_date: values.end_date,
    budget: values.budget ?? 0,
  }
}

/** Delete confirmation text: deleting a project also deletes everything recorded against it. */
export function deleteProjectMessage(project) {
  const deliverables = countLabel(project.deliverables_total, 'deliverable')
  const allocations = countLabel(project.team_size, 'team allocation')
  return (
    `"${project.name}" will be permanently deleted, together with its ${deliverables} ` +
    `(and their dependency links), ${allocations} and all of its expenses. This cannot be undone.`
  )
}
