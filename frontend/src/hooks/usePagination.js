import { useState } from 'react'

/**
 * Client-side paging over a list the API returns whole. The page is clamped when the
 * list shrinks (e.g. after filtering), so it never points past the end.
 * @template T
 * @param {T[]} items
 * @param {{rowsPerPage?: number}} [options]
 * @returns {{pageItems: T[], page: number, rowsPerPage: number, count: number,
 *   setPage: (page: number) => void, setRowsPerPage: (rows: number) => void}}
 */
export default function usePagination(items, { rowsPerPage: initialRows = 10 } = {}) {
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRows] = useState(initialRows)
  const lastPage = Math.max(0, Math.ceil(items.length / rowsPerPage) - 1)
  const current = Math.min(page, lastPage)

  return {
    pageItems: items.slice(current * rowsPerPage, (current + 1) * rowsPerPage),
    page: current,
    rowsPerPage,
    count: items.length,
    setPage,
    setRowsPerPage: (rows) => {
      setRows(rows)
      setPage(0)
    },
  }
}
