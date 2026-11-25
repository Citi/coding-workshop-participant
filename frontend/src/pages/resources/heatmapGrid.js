// Pure helpers for the allocation heat map (the Resources page's "Heat map" view): the grid of people
// and projects, each person's load over active projects, and the cell shading.
import { labelFor } from '../../utils/labels'
import { FULL_TIME_PERCENT } from './resourceUtils'

/** Only allocations to active projects count toward a person's load (docs/API.md › Resources). */
const COUNTED_STATUS = 'active'

// Names sort like people read them: case-insensitive, and "Phase 2" before "Phase 10" (as in DataTable).
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
const compareNames = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''))

/** The API's rule: over-allocated above 100% across active projects (exactly 100% is full time). */
export function isOverAllocated(total) {
  return total > FULL_TIME_PERCENT
}

/**
 * Who works on which project, as a grid:
 *
 *   const { columns, rows, consistent } = buildHeatmapGrid(resources, allocations)
 *
 * resources - GET /resources items: the people to show (the page's filters already applied)
 * allocations - GET /allocations items: everyone's; those of people not in `resources` are left out
 *
 *  - columns: [{ id, name, status, counted }] the projects at least one of these people is allocated
 *    to: active projects (counted toward the load) first, then the others, each group by name
 *  - rows: one per person, by name: { resource, cells, total, overAllocated, consistent }
 *    - cells: [{ projectId, percent, counted }] in column order; percent is null without an allocation
 *    - total: the sum of the counted (active) cells; overAllocated: total > 100
 *    - consistent: total equals the API's total_allocation_percent (they differ only when the
 *      allocations changed between the two requests)
 *  - consistent: true when every row is
 */
export function buildHeatmapGrid(resources, allocations) {
  const people = [...(resources || [])].sort((a, b) => compareNames(a.full_name, b.full_name) || a.id - b.id)
  const percents = new Map(people.map((resource) => [resource.id, new Map()]))
  const projects = new Map()
  for (const allocation of allocations || []) {
    const personPercents = percents.get(allocation.resource_id)
    if (!personPercents) continue
    if (!projects.has(allocation.project_id)) projects.set(allocation.project_id, projectColumn(allocation))
    // The API allows one allocation per person and project; adding keeps the total right regardless.
    const previous = personPercents.get(allocation.project_id) ?? 0
    personPercents.set(allocation.project_id, previous + Number(allocation.allocation_percent))
  }

  const columns = [...projects.values()].sort(
    (a, b) => Number(b.counted) - Number(a.counted) || compareNames(a.name, b.name) || a.id - b.id,
  )
  const rows = people.map((resource) => {
    const cells = columns.map((project) => ({
      projectId: project.id,
      percent: percents.get(resource.id).get(project.id) ?? null,
      counted: project.counted,
    }))
    const total = cells.reduce((sum, cell) => (cell.counted && cell.percent !== null ? sum + cell.percent : sum), 0)
    return {
      resource,
      cells,
      total,
      overAllocated: isOverAllocated(total),
      consistent: total === Number(resource.total_allocation_percent ?? 0),
    }
  })
  return { columns, rows, consistent: rows.every((row) => row.consistent) }
}

function projectColumn(allocation) {
  return {
    id: allocation.project_id,
    name: allocation.project_name,
    status: allocation.project_status,
    counted: allocation.project_status === COUNTED_STATUS,
  }
}

/** The line under a project's name in its column header: 'Active', or e.g. 'Planned – not counted'. */
export function columnStatusText(column) {
  const status = labelFor('project', column.status)
  return column.counted ? status : `${status} – not counted`
}

/**
 * Cell shading by allocation %, one step per quarter of full time: light to darker tints of the app's
 * blue (Tailwind blue 100-400, the family of the theme's primary #1d4ed8). The cell text is HEAT_TEXT
 * on every step, at 6.9:1 contrast or more (WCAG AA asks 4.5:1; heatmapGrid.test.js checks each pair).
 */
export const HEAT_STEPS = [
  { max: 25, label: '1–25%', background: '#dbeafe' },
  { max: 50, label: '26–50%', background: '#bfdbfe' },
  { max: 75, label: '51–75%', background: '#93c5fd' },
  { max: 100, label: '76–100%', background: '#60a5fa' },
]

/** Text of the shaded cells (Tailwind gray 900). */
export const HEAT_TEXT = '#111827'

/** Columns of projects that are not active (their allocations do not count): flat grey, grey text. */
export const MUTED_BACKGROUND = '#f3f4f6'
export const MUTED_TEXT = '#4b5563'

/** Behind a total over 100% (light red; the number itself is in the theme's error red). */
export const OVER_ALLOCATED_BACKGROUND = '#fef2f2'

/** The HEAT_STEPS entry of an allocation % (the darkest one above 100%); null without an allocation. */
export function heatStep(percent) {
  if (!(percent > 0)) return null
  return HEAT_STEPS.find((step) => percent <= step.max) ?? HEAT_STEPS[HEAT_STEPS.length - 1]
}
