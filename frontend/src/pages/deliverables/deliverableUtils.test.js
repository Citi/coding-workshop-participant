import { describe, expect, it } from 'vitest'
import { deliverableFields, deliverableFilters, dependencyOptions, initialDeliverableValues } from './deliverableFields'
import { BUILD, DELIVERABLES, PROJECTS, RESOURCES, SIGN_OFF } from './deliverableFixtures'
import { DELIVERABLE_URL_FILTERS, filtersFromSearchParams, isBlocker, selfAndDependentIds, sortChain } from './deliverableUtils'
import { hasActiveFilters } from '../../utils/filters'
import { includeOption } from '../../utils/options'
import { countLabel } from '../../utils/text'

describe('filtersFromSearchParams', () => {
  it('reads the filters a dashboard link can set', () => {
    const params = new URLSearchParams('is_key=true&overdue=true&project_id=3&status=blocked&search=%20audit%20')
    expect(filtersFromSearchParams(params)).toEqual({ is_key: true, overdue: true, project_id: 3, status: 'blocked', search: 'audit' })
  })

  it('ignores missing and invalid values', () => {
    expect(filtersFromSearchParams(new URLSearchParams(''))).toEqual({})
    const params = new URLSearchParams('is_key=yes&overdue=false&project_id=abc&status=done&search=%20')
    expect(filtersFromSearchParams(params)).toEqual({})
    expect(filtersFromSearchParams(new URLSearchParams('project_id=-2'))).toEqual({})
    expect(filtersFromSearchParams(new URLSearchParams('project_id=1.5'))).toEqual({})
    // Ids are database integers: a larger one can never exist and the API rejects it with 400.
    expect(filtersFromSearchParams(new URLSearchParams('project_id=2147483648'))).toEqual({})
    expect(filtersFromSearchParams(new URLSearchParams('project_id=2147483647'))).toEqual({ project_id: 2147483647 })
    // The API rejects a search longer than 200 characters with 400.
    expect(filtersFromSearchParams(new URLSearchParams(`search=${'a'.repeat(201)}&is_key=true`))).toEqual({ is_key: true })
  })

  it('names every parameter it reads, so the page can rewrite exactly those', () => {
    const params = new URLSearchParams('search=a&status=blocked&project_id=3&is_key=true&overdue=true')
    expect(Object.keys(filtersFromSearchParams(params)).sort()).toEqual([...DELIVERABLE_URL_FILTERS].sort())
  })
})

describe('deliverable helpers', () => {
  it('detects active filters', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ search: undefined })).toBe(false)
    expect(hasActiveFilters({ search: '' })).toBe(false)
    expect(hasActiveFilters({ is_key: true })).toBe(true)
  })

  it('finds a deliverable and everything downstream of it', () => {
    // 10 <- 12 (12 depends on 10); 10 depends on 8 and 9, which must stay selectable.
    expect([...selfAndDependentIds(DELIVERABLES, 10)].sort((a, b) => a - b)).toEqual([10, 12])
    // 7 <- 9 <- 10 <- 12
    expect([...selfAndDependentIds(DELIVERABLES, 7)].sort((a, b) => a - b)).toEqual([7, 9, 10, 12])
    expect([...selfAndDependentIds(DELIVERABLES, 12)]).toEqual([12])
  })

  it('handles diamond-shaped graphs without visiting a node twice', () => {
    const graph = [
      { id: 1, depends_on_ids: [] },
      { id: 2, depends_on_ids: [1] },
      { id: 3, depends_on_ids: [1] },
      { id: 4, depends_on_ids: [2, 3] },
      { id: 5 },
    ]
    expect([...selfAndDependentIds(graph, 1)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })

  it('applies the blocker rule', () => {
    expect(isBlocker({ status: 'completed' })).toBe(false)
    expect(isBlocker({ status: 'not_started' })).toBe(true)
  })

  it('orders the dependency chain by depth, then due date', () => {
    const chain = [
      { id: 1, depth: 2, due_date: '2026-01-01' },
      { id: 2, depth: 1, due_date: '2026-05-01' },
      { id: 3, depth: 1, due_date: '2026-02-01' },
    ]
    expect(sortChain(chain).map((item) => item.id)).toEqual([3, 2, 1])
    expect(chain[0].id).toBe(1)
  })

  it('keeps the current value among the select options', () => {
    const options = [{ value: 1, label: 'Apollo' }]
    expect(includeOption(options, 1, 'Apollo')).toBe(options)
    expect(includeOption(options, undefined)).toBe(options)
    expect(includeOption(options, '')).toBe(options)
    expect(includeOption(options, 2, 'Zeus')).toEqual([{ value: 2, label: 'Zeus' }, ...options])
    expect(includeOption(options, 3)).toEqual([{ value: 3, label: '#3' }, ...options])
  })

  it('pluralises labels', () => {
    expect(countLabel(1, 'prerequisite')).toBe('1 prerequisite')
    expect(countLabel(0, 'prerequisite')).toBe('0 prerequisites')
  })
})

describe('deliverable form config', () => {
  const options = { projects: PROJECTS, resources: RESOURCES, deliverables: DELIVERABLES }
  const field = (fields, name) => fields.find((item) => item.name === name)

  it('labels prerequisites "name (project)" and excludes the deliverable and its dependents', () => {
    expect(dependencyOptions(DELIVERABLES).map((option) => option.label)).toEqual([
      'Build MVP (Apollo CRM)',
      'Data audit (Zeus ERP)',
      'Requirements sign-off (Apollo CRM)',
      'Stakeholder interviews (Apollo CRM)',
      'Vendor contract (Zeus ERP)',
    ])
    expect(dependencyOptions(DELIVERABLES, SIGN_OFF).map((option) => option.value)).toEqual([9, 8, 7])
  })

  it('mirrors the API rules in the fields', () => {
    const fields = deliverableFields(options)
    expect(fields.map((item) => item.name)).toEqual(['project_id', 'name', 'description', 'status', 'due_date', 'owner_id', 'is_key', 'depends_on_ids'])
    expect(fields.filter((item) => item.required).map((item) => item.name)).toEqual(['project_id', 'name', 'status', 'due_date'])
    expect(field(fields, 'name').maxLength).toBe(150)
    expect(field(fields, 'description').maxLength).toBe(5000)
    expect(field(fields, 'project_id').disabled).toBe(false)
    expect(field(fields, 'owner_id').options).toEqual([
      { value: 4, label: 'Priya Shah' },
      { value: 5, label: 'Tom Lee' },
    ])
  })

  it('locks the project and keeps references that are missing from the options', () => {
    const fields = deliverableFields({ projects: [], resources: [], deliverables: [] }, { deliverable: BUILD, fixedProject: true })
    expect(field(fields, 'project_id')).toMatchObject({ disabled: true, options: [{ value: 1, label: 'Apollo CRM' }] })
    expect(field(fields, 'owner_id').options).toEqual([{ value: 4, label: 'Priya Shah' }])
    expect(field(fields, 'depends_on_ids').helperText).toMatch(/would create a cycle/)
  })

  it('starts a new deliverable with the API defaults', () => {
    expect(initialDeliverableValues(null, 3)).toEqual({ project_id: 3, status: 'not_started', is_key: false, depends_on_ids: [] })
    expect(initialDeliverableValues(undefined)).toMatchObject({ project_id: '' })
    expect(initialDeliverableValues(SIGN_OFF)).toBe(SIGN_OFF)
  })

  it('builds the filter bar config', () => {
    expect(deliverableFilters().map((item) => item.name)).toEqual(['status', 'is_key', 'overdue'])
    const withProjects = deliverableFilters({ projectOptions: [{ value: 1, label: 'Apollo CRM' }] })
    expect(withProjects.map((item) => item.name)).toEqual(['project_id', 'status', 'is_key', 'overdue'])
    expect(withProjects.find((item) => item.name === 'is_key')).toMatchObject({ label: 'Key deliverables only', type: 'toggle' })
  })
})
