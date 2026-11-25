import { useCallback, useEffect, useState } from 'react'

/**
 * Load data from the API and track loading/error state.
 * `fetcher` must be memoised (useCallback); it re-runs whenever it changes or reload() is called.
 *
 *   const fetchProjects = useCallback(() => projectsApi.list(filters), [filters])
 *   const { data, loading, error, reload } = useApiQuery(fetchProjects)
 */
export function useApiQuery(fetcher) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let active = true
    Promise.resolve()
      .then(() => {
        if (active) setState((previous) => ({ ...previous, loading: true, error: null }))
        return fetcher()
      })
      .then((data) => {
        if (active) setState({ data, error: null, loading: false })
      })
      .catch((error) => {
        if (active) setState((previous) => ({ data: previous.data, error, loading: false }))
      })
    return () => {
      active = false
    }
  }, [fetcher, reloadCount])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])
  return { ...state, reload }
}
