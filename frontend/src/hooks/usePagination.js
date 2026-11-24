/**
 * Pagination state for API lists that take `limit` and `offset`.
 */
import { useCallback, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../constants.js';

/**
 * Track the page and page size of a server-paginated table.
 * Call `reset()` from filter change handlers so new filters start on the first page.
 * @param {number} [initialRowsPerPage] - Initial page size.
 * @returns {{page: number, rowsPerPage: number, limit: number, offset: number,
 *   setPage: (page: number) => void, setRowsPerPage: (rows: number) => void, reset: () => void}}
 *   Paging state plus `limit`/`offset` ready for the API.
 */
export function usePagination(initialRowsPerPage = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPageState] = useState(initialRowsPerPage);

  const setRowsPerPage = useCallback((rows) => {
    setRowsPerPageState(rows);
    setPage(0);
  }, []);
  const reset = useCallback(() => setPage(0), []);

  return {
    page,
    rowsPerPage,
    limit: rowsPerPage,
    offset: page * rowsPerPage,
    setPage,
    setRowsPerPage,
    reset,
  };
}

export default usePagination;
