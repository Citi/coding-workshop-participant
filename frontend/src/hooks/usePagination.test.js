import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import usePagination from './usePagination'

const numbers = (n) => Array.from({ length: n }, (_, i) => i + 1)

describe('usePagination', () => {
  it('shows the first page', () => {
    const { result } = renderHook(() => usePagination(numbers(25)))
    expect(result.current.pageItems).toEqual(numbers(10))
    expect(result.current).toMatchObject({ page: 0, rowsPerPage: 10, count: 25 })
  })

  it('handles an empty list', () => {
    const { result } = renderHook(() => usePagination([]))
    expect(result.current.pageItems).toEqual([])
    expect(result.current.page).toBe(0)
  })

  it('moves between pages, with a short last page', () => {
    const { result } = renderHook(() => usePagination(numbers(25)))
    act(() => result.current.setPage(2))
    expect(result.current.pageItems).toEqual([21, 22, 23, 24, 25])
  })

  it('goes back to the first page when the page size changes', () => {
    const { result } = renderHook(() => usePagination(numbers(60)))
    act(() => result.current.setPage(3))
    act(() => result.current.setRowsPerPage(25))
    expect(result.current.page).toBe(0)
    expect(result.current.pageItems).toHaveLength(25)
  })

  it('clamps the page when the list shrinks', () => {
    const { result, rerender } = renderHook(({ items }) => usePagination(items), {
      initialProps: { items: numbers(35) },
    })
    act(() => result.current.setPage(3))
    rerender({ items: numbers(12) })
    expect(result.current.page).toBe(1)
    expect(result.current.pageItems).toEqual([11, 12])
  })
})
