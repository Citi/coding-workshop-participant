// Pure helpers for the deliverables screens: URL filters, the dependency graph and small labels.
import { todayIso } from '../../utils/format'
import { DELIVERABLE_STATUSES } from '../../utils/labels'
import { parseId } from '../../utils/ids'

const STATUS_VALUES = new Set(DELIVERABLE_STATUSES.map((status) => status.value))

/**
 * Filters that a link can preselect, e.g. #/deliverables?is_key=true&overdue=true&project_id=3
 * (used by the dashboard). Unknown or invalid values are ignored.
 */
export function filtersFromSearchParams(params) {
  const filters = {}
  const search = params.get('search')?.trim()
  if (search) filters.search = search
  const status = params.get('status')
  if (STATUS_VALUES.has(status)) filters.status = status
  const projectId = parseId(params.get('project_id'))
  if (projectId) filters.project_id = projectId
  if (params.get('is_key') === 'true') filters.is_key = true
  if (params.get('overdue') === 'true') filters.overdue = true
  return filters
}

/**
 * The deliverable `id` plus every deliverable that depends on it, directly or indirectly.
 * Choosing any of them as a prerequisite of `id` would create a dependency cycle.
 */
export function selfAndDependentIds(deliverables, id) {
  const dependentsOf = new Map()
  deliverables.forEach((deliverable) => {
    ;(deliverable.depends_on_ids || []).forEach((prerequisiteId) => {
      if (!dependentsOf.has(prerequisiteId)) dependentsOf.set(prerequisiteId, [])
      dependentsOf.get(prerequisiteId).push(deliverable.id)
    })
  })
  const found = new Set([id])
  const queue = [id]
  while (queue.length) {
    const current = queue.shift()
    ;(dependentsOf.get(current) || []).forEach((dependentId) => {
      if (!found.has(dependentId)) {
        found.add(dependentId)
        queue.push(dependentId)
      }
    })
  }
  return found
}

/** A prerequisite that is not completed yet holds up everything that depends on it. */
export const isBlocker = (item) => item.status !== 'completed'

/** The API's overdue rule, for related deliverables that do not carry the `is_overdue` flag. */
export function isOverdue(item, today = todayIso()) {
  return item.status !== 'completed' && Boolean(item.due_date) && item.due_date < today
}

/** Dependency chain ordered by depth (1 = direct prerequisite), then by due date. */
export function sortChain(chain) {
  return [...chain].sort((a, b) => a.depth - b.depth || String(a.due_date).localeCompare(String(b.due_date)))
}

