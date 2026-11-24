import { describe, expect, it } from 'vitest'
import {
  allocationFields,
  allocationFormDescription,
  allocationLabel,
  allocationQuery,
  deleteAllocationMessage,
  initialAllocationValues,
  projectOption,
  resourceOption,
  toAllocationPayload,
  wholeNumber,
} from './allocationFields'
import { APOLLO, APOLLO_TEAM, HERMES, MARIA, PRIYA, PRIYA_ALLOCATIONS, PRIYA_APOLLO, PROJECTS, RESOURCES, TOM, ZEUS } from './resourceFixtures'
import { deleteResourceMessage, RESOURCE_FIELDS, resourceFilters, toResourcePayload } from './resourceFields'
import {
  allocationColor,
  allocationSummary,
  overAllocatedNotice,
  overAllocationWarning,
  RESOURCE_URL_FILTERS,
  resourceFiltersFromParams,
} from './resourceUtils'
import { hasActiveFilters } from '../../utils/filters'
import { parseId } from '../../utils/ids'
import { includeOption } from '../../utils/options'
import { countLabel } from '../../utils/text'

const OPTIONS = { resources: RESOURCES, projects: PROJECTS }
const field = (fields, name) => fields.find((item) => item.name === name)
const optionValues = (fields, name) => field(fields, name).options.map((option) => option.value)

describe('resourceUtils', () => {
  it('parses positive whole-number ids only', () => {
    expect(parseId('4')).toBe(4)
    expect(parseId(12)).toBe(12)
    expect(parseId('2147483647')).toBe(2147483647)
    for (const bad of ['abc', '0', '-3', '4.5', '', undefined, null, '2147483648', '99999999999999999999']) {
      expect(parseId(bad)).toBeUndefined()
    }
  })

  it('pluralises counts and detects active filters', () => {
    expect(countLabel(1, 'active project')).toBe('1 active project')
    expect(countLabel(0, 'active project')).toBe('0 active projects')
    expect(hasActiveFilters({ search: undefined })).toBe(false)
    expect(hasActiveFilters({ search: '', department: null })).toBe(false)
    expect(hasActiveFilters({ over_allocated: true })).toBe(true)
  })

  it('reads the filters a link can preselect and ignores anything else', () => {
    expect(resourceFiltersFromParams(new URLSearchParams('over_allocated=true&search=%20priya%20'))).toEqual({
      over_allocated: true,
      search: 'priya',
    })
    expect(resourceFiltersFromParams(new URLSearchParams('over_allocated=yes&search=%20&page=2'))).toEqual({})
    expect(resourceFiltersFromParams(new URLSearchParams('department=%20Sales%20&view=heatmap'))).toEqual({ department: 'Sales' })
    // Longer than the API accepts (it would answer 400).
    expect(resourceFiltersFromParams(new URLSearchParams(`department=${'d'.repeat(101)}&search=${'s'.repeat(201)}`))).toEqual({})
    const all = resourceFiltersFromParams(new URLSearchParams('search=a&department=IT&over_allocated=true'))
    expect(Object.keys(all).sort()).toEqual([...RESOURCE_URL_FILTERS].sort())
  })

  it('describes utilization and over-allocation', () => {
    expect(allocationColor(true)).toBe('error')
    expect(allocationColor(false)).toBe('primary')
    expect(allocationSummary(PRIYA)).toBe('120% across 2 active projects')
    expect(allocationSummary(TOM)).toBe('40% across 1 active project')
    expect(allocationSummary({})).toBe('0% across 0 active projects')
    expect(overAllocationWarning(PRIYA_APOLLO)).toBe('Priya Shah is now over-allocated (120%)')
    expect(overAllocatedNotice(1)).toBe('1 team member is over-allocated (more than 100% across active projects).')
    expect(overAllocatedNotice(2, true)).toBe('2 team members in this list are over-allocated (more than 100% across active projects).')
  })

  it('adds a missing current value to select options', () => {
    const options = [{ value: 1, label: 'Apollo CRM' }]
    expect(includeOption(options, 1, 'x')).toBe(options)
    expect(includeOption(options, undefined, 'x')).toBe(options)
    expect(includeOption(options, '', 'x')).toBe(options)
    expect(includeOption(options, 9, 'Project #9')).toEqual([{ value: 9, label: 'Project #9' }, ...options])
  })
})

describe('resourceFields', () => {
  it('requires every field with the API length limits', () => {
    expect(RESOURCE_FIELDS.map(({ name, required, maxLength }) => [name, required, maxLength])).toEqual([
      ['full_name', true, 120],
      ['email', true, 255],
      ['job_title', true, 100],
      ['department', true, 100],
    ])
    expect(RESOURCE_FIELDS.find((item) => item.name === 'email').type).toBe('email')
  })

  it('builds a trimmed full request body without computed fields', () => {
    expect(toResourcePayload({ ...PRIYA, full_name: '  Priya Shah ', department: ' IT' })).toEqual({
      full_name: 'Priya Shah',
      email: 'priya@acme.com',
      job_title: 'Developer',
      department: 'IT',
    })
    expect(toResourcePayload({})).toEqual({ full_name: '', email: '', job_title: '', department: '' })
  })

  it('explains what else a delete removes', () => {
    expect(deleteResourceMessage(PRIYA)).toBe(
      '"Priya Shah" will be permanently deleted. All of their project allocations will be removed (they are currently on ' +
        '2 active projects) and any deliverables they own will become unassigned. This cannot be undone.',
    )
    expect(deleteResourceMessage(MARIA)).toBe(
      '"Maria Garcia" will be permanently deleted. All of their project allocations will be removed and any deliverables ' +
        'they own will become unassigned. This cannot be undone.',
    )
  })

  it('configures the department select and the over-allocation toggle', () => {
    const departments = [{ value: 'IT', label: 'IT' }]
    expect(resourceFilters(departments)).toEqual([
      { name: 'department', label: 'Department', options: departments },
      { name: 'over_allocated', label: 'Over-allocated only', type: 'toggle' },
    ])
  })
})

describe('allocationFields', () => {
  it('labels options with the information needed to choose', () => {
    expect(resourceOption(PRIYA)).toEqual({ value: 4, label: 'Priya Shah (120% allocated)' })
    expect(resourceOption({ id: 9, full_name: 'New Person' })).toEqual({ value: 9, label: 'New Person (0% allocated)' })
    expect(projectOption(HERMES)).toEqual({ value: 3, label: 'Hermes Portal (Planned)' })
  })

  it('builds the list query for each context', () => {
    expect(allocationQuery({ projectId: 1 })).toEqual({ project_id: 1 })
    expect(allocationQuery({ resourceId: 4 })).toEqual({ resource_id: 4 })
    expect(allocationQuery({ projectId: 1, resourceId: 4 })).toEqual({ project_id: 1, resource_id: 4 })
    expect(allocationQuery()).toEqual({})
  })

  it('lets both selects be chosen when nothing is fixed, sorted by name', () => {
    const fields = allocationFields(OPTIONS)
    expect(optionValues(fields, 'resource_id')).toEqual([MARIA.id, PRIYA.id, TOM.id])
    expect(optionValues(fields, 'project_id')).toEqual([APOLLO.id, HERMES.id, ZEUS.id])
    expect(field(fields, 'resource_id')).toMatchObject({ required: true, disabled: false, helperText: undefined })
    expect(field(fields, 'project_id')).toMatchObject({ required: true, disabled: false, helperText: undefined })
    expect(field(fields, 'allocation_percent')).toMatchObject({ type: 'number', required: true, min: 1, max: 100, step: 1 })
  })

  it("locks the project of a project's team and leaves out people already on it", () => {
    const fields = allocationFields(OPTIONS, { projectId: APOLLO.id, existing: APOLLO_TEAM })
    expect(field(fields, 'project_id').disabled).toBe(true)
    expect(optionValues(fields, 'resource_id')).toEqual([MARIA.id])
    expect(field(fields, 'resource_id').helperText).toMatch(/already on this project are not listed/)
  })

  it("locks the person of a person's list and leaves out projects they are already on", () => {
    const fields = allocationFields(OPTIONS, { resourceId: TOM.id, existing: [APOLLO_TEAM[1]] })
    expect(field(fields, 'resource_id').disabled).toBe(true)
    expect(optionValues(fields, 'project_id')).toEqual([HERMES.id, ZEUS.id])
    expect(field(fields, 'project_id').helperText).toMatch(/already on are not listed/)
  })

  it('keeps the edited allocation itself selectable', () => {
    const fields = allocationFields(OPTIONS, { allocation: PRIYA_APOLLO, resourceId: PRIYA.id, existing: PRIYA_ALLOCATIONS })
    expect(optionValues(fields, 'project_id')).toEqual([APOLLO.id])
  })

  it('keeps a fixed or current value that is missing from the loaded options', () => {
    const empty = { resources: [], projects: [] }
    expect(field(allocationFields(empty, { resourceId: 4 }), 'resource_id').options).toEqual([{ value: 4, label: 'Resource #4' }])
    expect(field(allocationFields(empty, { projectId: 1 }), 'project_id').options).toEqual([{ value: 1, label: 'Project #1' }])
    const editing = allocationFields(empty, { allocation: PRIYA_APOLLO })
    expect(field(editing, 'resource_id').options).toEqual([{ value: 4, label: 'Priya Shah' }])
    expect(field(editing, 'project_id').options).toEqual([{ value: 1, label: 'Apollo CRM' }])
  })

  it('accepts whole percentages only', () => {
    expect(wholeNumber('40')).toBeUndefined()
    expect(wholeNumber('')).toBeUndefined()
    expect(wholeNumber('12.5')).toBe('Must be a whole number')
  })

  it('builds initial values and the integer request body', () => {
    expect(initialAllocationValues(PRIYA_APOLLO)).toBe(PRIYA_APOLLO)
    expect(initialAllocationValues(null, { projectId: 1 })).toEqual({ resource_id: undefined, project_id: 1 })
    expect(toAllocationPayload({ resource_id: 4, project_id: '1', allocation_percent: 60, extra: 'x' })).toEqual({
      resource_id: 4,
      project_id: 1,
      allocation_percent: 60,
    })
  })

  it('describes the form, names allocations and explains a delete', () => {
    expect(allocationFormDescription({ projectId: 1 })).toMatch(/^Add a team member to this project/)
    expect(allocationFormDescription({ resourceId: 4 })).toMatch(/^Allocate this person to a project/)
    expect(allocationFormDescription()).toMatch(/^Allocate a team member to a project/)
    expect(allocationLabel(PRIYA_APOLLO)).toBe('Priya Shah on Apollo CRM')
    expect(deleteAllocationMessage(PRIYA_APOLLO)).toBe(
      'Priya Shah will no longer be allocated to Apollo CRM (60%). Their total allocation is recalculated; ' +
        'deliverables they own are not changed. This cannot be undone.',
    )
  })
})
