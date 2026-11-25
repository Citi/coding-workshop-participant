// List filters kept in the URL query string (e.g. #/projects?status=active&search=crm), so a reload,
// Back from a detail page and shared links keep the view.
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useHref, useLocation, useSearchParams } from 'react-router-dom'

/** The API rejects a longer search with 400 VALIDATION_ERROR (FilterBar stops typing there too). */
export const SEARCH_MAX_LENGTH = 200

/**
 * Trimmed text of a query parameter, or undefined when it is missing, blank, longer than the API
 * accepts or contains a NUL character (the API would answer 400 to those).
 */
export function textParam(params, name, maxLength = SEARCH_MAX_LENGTH) {
  const value = params.get(name)?.trim()
  return value && value.length <= maxLength && !value.includes('\u0000') ? value : undefined
}

function decodedPath(path) {
  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

/**
 * [searchParams, setSearchParams, latest] - useSearchParams plus latest(), the query string as it is
 * right now. The app's HashRouter updates the address bar at once but re-renders inside a React
 * transition, so the rendered `searchParams` can lag behind for a moment. Building the next URL from
 * them would drop a change made just before (a search typed right before a view switch, or the other
 * way round), so latest() reads the address bar instead. It returns null when the address bar already
 * shows another page (the user is leaving): callers then skip their update. Routers without an address
 * bar (MemoryRouter in tests) get the rendered params.
 */
export function useLatestSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { pathname } = useLocation()
  const hashRouter = useHref('/').includes('#')
  const latest = useCallback(() => {
    if (!hashRouter) return new URLSearchParams(searchParams)
    const { hash } = window.location
    const query = hash.indexOf('?')
    const livePath = query === -1 ? hash.slice(1) : hash.slice(1, query)
    if (decodedPath(livePath) !== decodedPath(pathname)) return null
    return new URLSearchParams(query === -1 ? '' : hash.slice(query + 1))
  }, [hashRouter, searchParams, pathname])
  return [searchParams, setSearchParams, latest]
}

/** A filter value as it is written to the URL; undefined removes the parameter (like a switch turned off). */
function paramValue(value) {
  const text = typeof value === 'string' ? value.trim() : value
  return text === undefined || text === null || text === '' || text === false ? undefined : String(text)
}

/**
 *   const [filters, setFilters] = useUrlFilters(parseFilters, ['search', 'status'])
 *
 * The URL is the only copy of the filters, so a link, the menu or Back/Forward change them too.
 *  - parse(searchParams) -> the filters object; it leaves out invalid values (they are ignored)
 *  - keys: the parameters the filters own. setFilters(next) rewrites only those, replacing the
 *    current history entry (Back still leaves the page); every other parameter (e.g. view=timeline)
 *    is kept as it is.
 *  - `filters` keeps its identity until a filter value changes (other parameters do not count), so it
 *    is safe as a useCallback / useApiQuery dependency.
 *  - setFilters does nothing once the page has unmounted: a late call (a timer, a request that
 *    finished after the user left) must not rewrite the URL of the page the user is on now.
 */
export function useUrlFilters(parse, keys) {
  const [searchParams, setSearchParams, latest] = useLatestSearchParams()
  const signature = JSON.stringify(parse(searchParams))
  const filters = useMemo(() => JSON.parse(signature), [signature])

  // A layout effect, so it is set again (after StrictMode's test unmount) before any child's effect
  // can call setFilters.
  const mounted = useRef(true)
  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const setFilters = useCallback(
    (next) => {
      if (!mounted.current) return
      const current = latest()
      if (!current) return
      const params = new URLSearchParams(current)
      keys.forEach((key) => {
        const value = paramValue(next[key])
        // set() keeps the parameter where it was, so an unchanged filter leaves the URL unchanged.
        if (value === undefined) params.delete(key)
        else params.set(key, value)
      })
      if (params.toString() !== current.toString()) setSearchParams(params, { replace: true })
    },
    [keys, latest, setSearchParams],
  )

  return [filters, setFilters]
}
