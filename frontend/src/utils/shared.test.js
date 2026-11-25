import { describe, expect, it } from 'vitest'
import { hasActiveFilters } from './filters'
import { MAX_ID, parseId } from './ids'
import { byLabel, includeOption, includeTextOption } from './options'
import { countLabel } from './text'

describe('shared utils', () => {
  it('countLabel pluralises', () => {
    expect(countLabel(1, 'project')).toBe('1 project')
    expect(countLabel(2, 'project')).toBe('2 projects')
    expect(countLabel(0, 'person', 'people')).toBe('0 people')
    expect(countLabel(undefined, 'item')).toBe('0 items')
  })

  it('hasActiveFilters ignores empty values', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ search: undefined, status: '' , owner: null })).toBe(false)
    expect(hasActiveFilters({ is_key: true })).toBe(true)
  })

  it('includeOption keeps the current value selectable', () => {
    const options = [{ value: 2, label: 'Beta' }]
    expect(includeOption(options, 2, 'x')).toBe(options)
    expect(includeOption(options, '', 'x')).toBe(options)
    expect(includeOption(options, 7, 'Gamma')).toEqual([{ value: 7, label: 'Gamma' }, ...options])
    expect(includeOption(options, 9)).toEqual([{ value: 9, label: '#9' }, ...options])
    expect([{ label: 'b' }, { label: 'a' }].sort(byLabel)).toEqual([{ label: 'a' }, { label: 'b' }])
  })

  it('includeTextOption labels typed text as written and matches loaded options apart from case', () => {
    const options = [
      { value: 'Digital', label: 'Digital' },
      { value: 'Finance', label: 'Finance' },
    ]
    expect(includeTextOption(options, 'Digital')).toBe(options)
    expect(includeTextOption(options, undefined)).toBe(options)
    expect(includeTextOption(options, '')).toBe(options)
    // Not loaded (yet): its own name, never "#Data & Analytics".
    expect(includeTextOption(options, 'Data & Analytics')).toEqual([{ value: 'Data & Analytics', label: 'Data & Analytics' }, ...options])
    // Another spelling selects the loaded option, which keeps its label and its place: no second entry.
    expect(includeTextOption(options, 'dIGITAL')).toEqual([{ value: 'dIGITAL', label: 'Digital' }, options[1]])
    expect(includeTextOption(options, 'finance')).toEqual([options[0], { value: 'finance', label: 'Finance' }])
    expect(options).toEqual([
      { value: 'Digital', label: 'Digital' },
      { value: 'Finance', label: 'Finance' },
    ])
  })

  it('parseId accepts only positive database integers', () => {
    expect(parseId('12')).toBe(12)
    expect(parseId(String(MAX_ID))).toBe(MAX_ID)
    for (const bad of ['0', '-1', 'abc', '1e3', '01', String(MAX_ID + 1), undefined]) expect(parseId(bad)).toBeUndefined()
  })
})
