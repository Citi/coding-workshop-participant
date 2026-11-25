import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mergeDepartments, useDepartmentOptions } from './useDepartmentOptions'

describe('useDepartmentOptions', () => {
  it('merges department names case-insensitively, sorted, ignoring blanks', () => {
    const projects = [{ department: 'Sales' }, { department: ' it ' }, { department: 'sales' }, { department: '' }, {}]
    expect(mergeDepartments(['Finance'], projects)).toEqual(['Finance', 'it', 'Sales'])
  })

  it('keeps departments from earlier loads when a later load is narrower', () => {
    const { result, rerender } = renderHook(({ projects }) => useDepartmentOptions(projects), {
      initialProps: { projects: undefined },
    })
    expect(result.current).toEqual([])

    rerender({ projects: [{ department: 'Sales' }, { department: 'IT' }] })
    expect(result.current).toEqual([
      { value: 'IT', label: 'IT' },
      { value: 'Sales', label: 'Sales' },
    ])

    rerender({ projects: [{ department: 'Sales' }] })
    expect(result.current.map((option) => option.value)).toEqual(['IT', 'Sales'])

    rerender({ projects: [{ department: 'Marketing' }] })
    expect(result.current.map((option) => option.value)).toEqual(['IT', 'Marketing', 'Sales'])
  })
})
