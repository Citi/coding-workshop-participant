import { act, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter, Link, MemoryRouter, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { DELIVERABLE_URL_FILTERS, filtersFromSearchParams } from '../pages/deliverables/deliverableUtils'
import { RESOURCE_URL_FILTERS, resourceFiltersFromParams } from '../pages/resources/resourceUtils'
import { SEARCH_MAX_LENGTH, textParam, useUrlFilters } from './useUrlFilters'

const KEYS = ['search', 'status', 'is_key']

function parse(params) {
  const filters = {}
  const search = textParam(params, 'search')
  if (search) filters.search = search
  if (['active', 'planned'].includes(params.get('status'))) filters.status = params.get('status')
  if (params.get('is_key') === 'true') filters.is_key = true
  return filters
}

function LocationProbe() {
  const location = useLocation()
  const navigationType = useNavigationType()
  return (
    <>
      <output aria-label="URL">{`${location.pathname}${location.search}`}</output>
      <output aria-label="Last navigation">{navigationType}</output>
      <Link to="/list?status=planned&view=board">Planned link</Link>
      <Link to="/list?status=active&view=board&page=2">Same filters link</Link>
    </>
  )
}

function renderFilters(url) {
  const wrapper = ({ children }) => (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/list"
          element={
            <>
              {children}
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
  return renderHook(() => useUrlFilters(parse, KEYS), { wrapper })
}

const currentUrl = () => screen.getByLabelText('URL').textContent
const lastNavigation = () => screen.getByLabelText('Last navigation').textContent

describe('useUrlFilters', () => {
  it('reads the filters from the URL and ignores invalid values', () => {
    const { result } = renderFilters('/list?search=%20crm%20&status=bogus&is_key=true&view=board')
    expect(result.current[0]).toEqual({ search: 'crm', is_key: true })
  })

  it('writes changes to the URL, replacing the history entry and keeping other parameters', () => {
    const { result } = renderFilters('/list?view=board&status=active')
    act(() => result.current[1]({ status: 'planned', search: ' crm ', is_key: false }))
    expect(currentUrl()).toBe('/list?view=board&status=planned&search=crm')
    expect(lastNavigation()).toBe('REPLACE')
    expect(result.current[0]).toEqual({ search: 'crm', status: 'planned' })

    act(() => result.current[1]({ ...result.current[0], is_key: true }))
    expect(currentUrl()).toBe('/list?view=board&status=planned&search=crm&is_key=true')
    act(() => result.current[1]({}))
    expect(currentUrl()).toBe('/list?view=board')
    expect(result.current[0]).toEqual({})
  })

  it('drops invalid filter parameters with the next change', () => {
    const { result } = renderFilters('/list?status=bogus&view=board')
    act(() => result.current[1]({ ...result.current[0], is_key: true }))
    expect(currentUrl()).toBe('/list?view=board&is_key=true')
  })

  it('does not navigate when the filters do not change', () => {
    const { result } = renderFilters('/list?status=active')
    act(() => result.current[1]({ status: 'active', search: '   ' }))
    expect(currentUrl()).toBe('/list?status=active')
    expect(lastNavigation()).toBe('POP')
  })

  it('keeps the filters object while only other parameters change, and follows links', async () => {
    const user = userEvent.setup()
    const { result } = renderFilters('/list?status=active&view=board')
    const first = result.current[0]

    await user.click(screen.getByRole('link', { name: 'Same filters link' }))
    expect(currentUrl()).toBe('/list?status=active&view=board&page=2')
    expect(result.current[0]).toBe(first)

    await user.click(screen.getByRole('link', { name: 'Planned link' }))
    expect(result.current[0]).toEqual({ status: 'planned' })
  })

  it('follows Back and Forward between two filter states while the page stays mounted', () => {
    let navigate
    const wrapper = ({ children }) => (
      <MemoryRouter initialEntries={['/list?status=active']}>
        <Routes>
          <Route path="/list" element={children} />
        </Routes>
      </MemoryRouter>
    )
    const { result } = renderHook(
      () => {
        navigate = useNavigate()
        return useUrlFilters(parse, KEYS)
      },
      { wrapper },
    )
    // A link (e.g. the menu) pushes a new entry; the filters on it are rewritten in place.
    act(() => navigate('/list'))
    act(() => result.current[1]({ search: 'crm' }))
    expect(result.current[0]).toEqual({ search: 'crm' })

    act(() => navigate(-1))
    expect(result.current[0]).toEqual({ status: 'active' })
    act(() => navigate(1))
    expect(result.current[0]).toEqual({ search: 'crm' })
  })

  it('ignores a call that comes after the page has unmounted: the location stays where the user went', () => {
    let navigate
    const wrapper = ({ children }) => (
      <MemoryRouter initialEntries={['/list?status=active']}>
        <Routes>
          <Route path="/list" element={children} />
          <Route path="/other" element={<p>Other page</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    )
    const { result } = renderHook(
      () => {
        navigate = useNavigate()
        return useUrlFilters(parse, KEYS)
      },
      { wrapper },
    )
    const lateSetFilters = result.current[1]
    act(() => navigate('/other'))
    expect(currentUrl()).toBe('/other')

    // E.g. a timer or a request of the list page that finishes after the user left it.
    act(() => lateSetFilters({ status: 'planned', search: 'crm' }))
    expect(currentUrl()).toBe('/other')
    expect(lastNavigation()).toBe('PUSH')
    expect(screen.getByText('Other page')).toBeInTheDocument()
  })

  it('keeps working in StrictMode, which mounts the page twice in development', () => {
    const { result } = renderHook(() => useUrlFilters(parse, KEYS), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/list?status=active']}>
          {children}
          <LocationProbe />
        </MemoryRouter>
      ),
      reactStrictMode: true,
    })
    act(() => result.current[1]({ status: 'planned' }))
    expect(currentUrl()).toBe('/list?status=planned')
  })
})

describe('useUrlFilters in the app router (HashRouter: #/page?query)', () => {
  /** The page's filters with the app's real router, starting from window.location.hash = `hash`. */
  function renderInApp(hash, parsePage, keys) {
    window.history.replaceState(null, '', hash) // no hashchange event: the router simply starts here
    const wrapper = ({ children }) => (
      <HashRouter>
        <Routes>
          <Route path="*" element={children} />
        </Routes>
      </HashRouter>
    )
    return renderHook(() => useUrlFilters(parsePage, keys), { wrapper }).result
  }

  it('round-trips characters with a meaning in URLs (&, +, %, #, ?, =) and non-ASCII text', () => {
    const result = renderInApp('#/deliverables', filtersFromSearchParams, DELIVERABLE_URL_FILTERS)
    const filters = { search: 'C++ & 100% #1 ?a=b', project_id: 3, status: 'blocked', is_key: true, overdue: true }
    act(() => result.current[1](filters))
    expect(window.location.hash).toBe(
      '#/deliverables?search=C%2B%2B+%26+100%25+%231+%3Fa%3Db&project_id=3&status=blocked&is_key=true&overdue=true',
    )
    expect(result.current[0]).toEqual(filters)

    act(() => result.current[1]({ ...result.current[0], search: 'Zoë – 😀' }))
    expect(result.current[0].search).toBe('Zoë – 😀')
  })

  // HashRouter writes the address bar at once but re-renders in a transition; history.replaceState
  // (no event, so the router does not re-render) reproduces that moment.
  const addressBarAhead = (hash) => window.history.replaceState(null, '', hash)
  afterEach(() => window.history.replaceState(null, '', window.location.pathname))

  it('builds on the address bar, not the last render, so a change made a moment before survives', () => {
    const result = renderInApp('#/list?status=active', parse, KEYS)
    addressBarAhead('#/list?status=active&view=timeline') // e.g. a view switch still rendering
    act(() => result.current[1]({ ...result.current[0], search: 'crm' }))
    expect(window.location.hash).toBe('#/list?status=active&view=timeline&search=crm')
  })

  it('skips the update when the address bar already shows another page (the user is leaving)', () => {
    const result = renderInApp('#/list?status=active', parse, KEYS)
    addressBarAhead('#/list/5')
    act(() => result.current[1]({ status: 'planned' }))
    expect(window.location.hash).toBe('#/list/5')
  })

  it('reads a department with special characters from a link and keeps other parameters', () => {
    const result = renderInApp('#/resources?department=Data+%26+Analytics&view=heatmap', resourceFiltersFromParams, RESOURCE_URL_FILTERS)
    expect(result.current[0]).toEqual({ department: 'Data & Analytics' })
    act(() => result.current[1]({ ...result.current[0], over_allocated: true }))
    expect(window.location.hash).toBe('#/resources?department=Data+%26+Analytics&view=heatmap&over_allocated=true')
    expect(result.current[0]).toEqual({ department: 'Data & Analytics', over_allocated: true })
  })
})

describe('textParam', () => {
  const params = (query) => new URLSearchParams(query)

  it('returns the trimmed text of a parameter', () => {
    expect(textParam(params('search=%20crm%20'), 'search')).toBe('crm')
    expect(textParam(params(`search=${'a'.repeat(SEARCH_MAX_LENGTH)}`), 'search')).toHaveLength(SEARCH_MAX_LENGTH)
  })

  it('leaves out what the API would reject or ignore', () => {
    expect(textParam(params(''), 'search')).toBeUndefined()
    expect(textParam(params('search=%20%20'), 'search')).toBeUndefined()
    expect(textParam(params(`search=${'a'.repeat(SEARCH_MAX_LENGTH + 1)}`), 'search')).toBeUndefined()
    expect(textParam(params('search=a%00b'), 'search')).toBeUndefined()
    expect(textParam(params(`department=${'d'.repeat(101)}`), 'department', 100)).toBeUndefined()
  })
})
