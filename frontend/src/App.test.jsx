import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { WAKE_UP_HINT } from './components/StateViews'
import { renderWithProviders } from './test/renderWithProviders'

// The Budget page's code chunk keeps "downloading" until the test lets it arrive.
const budgetChunk = vi.hoisted(() => {
  let arrive
  const arrived = new Promise((resolve) => {
    arrive = resolve
  })
  return { arrived, arrive: () => arrive() }
})
vi.mock('./pages/budget/BudgetPage', async () => {
  await budgetChunk.arrived
  return { default: () => <h1>Budget page</h1> }
})

// A Projects page with the real search box and URL filters (the text reaches the URL 300 ms after
// the last keystroke) and a link to a project, whose page's chunk downloads until the test lets it arrive.
const projectChunk = vi.hoisted(() => {
  let arrive
  const arrived = new Promise((resolve) => {
    arrive = resolve
  })
  return { arrived, arrive: () => arrive() }
})
vi.mock('./pages/projects/ProjectsPage', async () => {
  const { Link } = await import('react-router-dom')
  const { default: FilterBar } = await import('./components/FilterBar')
  const { textParam, useUrlFilters } = await import('./hooks/useUrlFilters')
  const parse = (params) => (textParam(params, 'search') ? { search: textParam(params, 'search') } : {})
  const keys = ['search']
  return {
    default: function ProjectsPageStandIn() {
      const [filters, setFilters] = useUrlFilters(parse, keys)
      return (
        <>
          <h1>Projects page</h1>
          <FilterBar values={filters} onChange={setFilters} />
          <Link to="/projects/7">Apollo CRM</Link>
        </>
      )
    },
  }
})
vi.mock('./pages/projects/ProjectDetailPage', async () => {
  await projectChunk.arrived
  const { useLocation } = await import('react-router-dom')
  return {
    default: function ProjectDetailPageStandIn() {
      const { pathname, search } = useLocation()
      return <h1>{`Project page ${pathname}${search}`}</h1>
    },
  }
})

describe('App', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a plain loading state while a page is downloading, without the database wake-up hint', async () => {
    vi.useFakeTimers()
    renderWithProviders(<App />, { route: '/budget' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/^Loading…$/)
    // A slow download is not a sleeping database, so even after a long wait there is no hint.
    act(() => vi.advanceTimersByTime(10000))
    expect(status).toHaveTextContent(/^Loading…$/)
    expect(screen.queryByText(WAKE_UP_HINT)).not.toBeInTheDocument()

    vi.useRealTimers()
    budgetChunk.arrive()
    expect(await screen.findByRole('heading', { level: 1, name: 'Budget page' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('leaves a page as soon as the user opens another, so a search still waiting to be sent cannot pull them back', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/projects' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects page' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'apollo')

    // Opened within the 300 ms before the search is sent, while the project page is still downloading.
    await user.click(screen.getByRole('link', { name: 'Apollo CRM' }))
    // The list is gone at once (with the search it was about to send), and the download shows.
    expect(screen.queryByRole('heading', { name: 'Projects page' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/^Loading…$/)

    // Long enough for the search to have been sent, had the list stayed on screen during the download.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)))
    projectChunk.arrive()
    expect(await screen.findByRole('heading', { level: 1, name: 'Project page /projects/7' })).toBeInTheDocument()
  })
})
