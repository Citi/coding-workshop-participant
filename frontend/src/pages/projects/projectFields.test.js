import { describe, expect, it } from 'vitest'
import { todayIso } from '../../utils/format'
import { makeProject } from './projectFixtures'
import { deleteProjectMessage, MAX_BUDGET, newProjectValues, PROJECT_FIELDS, toProjectPayload } from './projectFields'

const field = (name) => PROJECT_FIELDS.find((item) => item.name === name)

describe('projectFields', () => {
  it('mirrors the API validation rules', () => {
    expect(PROJECT_FIELDS.map((item) => item.name)).toEqual([
      'name', 'department', 'status', 'start_date', 'end_date', 'budget', 'description',
    ])
    expect(field('name')).toMatchObject({ required: true, maxLength: 150 })
    expect(field('department')).toMatchObject({ required: true, maxLength: 100 })
    expect(field('description')).toMatchObject({ type: 'textarea', maxLength: 5000 })
    expect(field('budget')).toMatchObject({ type: 'number', min: 0, max: MAX_BUDGET })
    expect(field('status').options.map((option) => option.value)).toEqual(['planned', 'active', 'on_hold', 'completed', 'cancelled'])
    expect(field('end_date').validate('2026-01-01', { start_date: '2026-02-01' })).toBe('Must be on or after the start date')
    expect(field('budget').validate('10.123')).toBe('Use at most 2 decimal places')
  })

  it('starts new projects as planned from today', () => {
    expect(newProjectValues()).toEqual({ status: 'planned', start_date: todayIso() })
  })

  it('builds a full request body and applies the API defaults', () => {
    const values = { name: 'Hermes', department: 'Finance', status: 'active', start_date: '2026-01-01', end_date: '2026-06-30', budget: null }
    expect(toProjectPayload(values)).toEqual({ ...values, description: '', budget: 0 })
    // Computed fields of a loaded project are never sent back.
    expect(Object.keys(toProjectPayload(makeProject()))).toEqual([
      'name', 'description', 'department', 'status', 'start_date', 'end_date', 'budget',
    ])
  })

  it('explains what else a delete removes', () => {
    expect(deleteProjectMessage(makeProject())).toBe(
      '"Apollo CRM" will be permanently deleted, together with its 5 deliverables (and their dependency links), ' +
        '3 team allocations and all of its expenses. This cannot be undone.',
    )
    expect(deleteProjectMessage(makeProject({ deliverables_total: 1, team_size: 1 }))).toContain('its 1 deliverable (and their dependency links), 1 team allocation and')
  })
})
