import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deliverablesApi } from '../../services/deliverablesApi'
import { projectsApi } from '../../services/projectsApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import DeliverablesPage from './DeliverablesPage'
import { DELIVERABLES, PROJECTS, list } from './deliverableFixtures'

vi.mock('../../services/deliverablesApi', () => ({
  deliverablesApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('../../services/projectsApi', () => ({ projectsApi: { list: vi.fn() } }))
vi.mock('../../services/resourcesApi', () => ({ resourcesApi: { list: vi.fn() } }))

/** The address bar: path and query string of the current location. */
function UrlProbe() {
  const location = useLocation()
  return <p data-testid="url">{`${location.pathname}${location.search}`}</p>
}

function renderPage(route = '/deliverables', options = {}) {
  return renderWithProviders(
    <>
      <Link to="/deliverables">All deliverables</Link>
      <Link to="/deliverables?overdue=true">Overdue deliverables</Link>
      <DeliverablesPage />
      <UrlProbe />
    </>,
    { route, path: '/deliverables', ...options },
  )
}

const currentUrl = () => screen.getByTestId('url').textContent
const searchBox = () => screen.getByRole('textbox', { name: 'Search' })

async function choose(user, fieldName, optionName) {
  await user.click(screen.getByRole('combobox', { name: fieldName }))
  const listbox = await screen.findByRole('listbox')
  await user.click(within(listbox).getByRole('option', { name: optionName }))
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

describe('DeliverablesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deliverablesApi.list.mockResolvedValue(list(DELIVERABLES))
    projectsApi.list.mockResolvedValue(list(PROJECTS))
  })

  it('lists the deliverables of every project under the page header', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Deliverables' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New deliverable' })).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'Project' })).toBeInTheDocument()
    expect(deliverablesApi.list).toHaveBeenCalledWith({})
  })

  it('starts from the filters in the link (e.g. from the dashboard)', async () => {
    renderPage('/deliverables?is_key=true&overdue=true&project_id=2&status=blocked&search=audit')
    await waitFor(() =>
      expect(deliverablesApi.list).toHaveBeenCalledWith({ is_key: true, overdue: true, project_id: 2, status: 'blocked', search: 'audit' }),
    )
    expect(deliverablesApi.list).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Key deliverables only')).toBeChecked()
    expect(screen.getByLabelText('Overdue only')).toBeChecked()
    expect(screen.getByLabelText('Search')).toHaveValue('audit')
    expect(await screen.findByRole('combobox', { name: /Project/ })).toHaveTextContent('Zeus ERP')
  })

  it('resets to the new link when the URL changes, search box included', async () => {
    const user = userEvent.setup()
    renderPage('/deliverables?is_key=true&search=audit')
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({ is_key: true, search: 'audit' }))
    await user.click(screen.getByRole('link', { name: 'All deliverables' }))
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({}))
    expect(screen.getByLabelText('Key deliverables only')).not.toBeChecked()
    expect(searchBox()).toHaveValue('')

    await user.type(searchBox(), 'vendor')
    await waitFor(() => expect(currentUrl()).toBe('/deliverables?search=vendor'))
    // A dashboard link replaces the filters and the text in the search box.
    await user.click(screen.getByRole('link', { name: 'Overdue deliverables' }))
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({ overdue: true }))
    expect(screen.getByLabelText('Overdue only')).toBeChecked()
    expect(searchBox()).toHaveValue('')
    expect(currentUrl()).toBe('/deliverables?overdue=true')
  })

  it('writes each filter change to the address bar, keeping other parameters', async () => {
    const user = userEvent.setup()
    renderPage('/deliverables?view=board')
    await screen.findByRole('table')
    await user.click(screen.getByLabelText('Key deliverables only'))
    expect(currentUrl()).toBe('/deliverables?view=board&is_key=true')
    await choose(user, /Project/, 'Zeus ERP')
    expect(currentUrl()).toBe('/deliverables?view=board&is_key=true&project_id=2')
    await choose(user, /Status/, 'Blocked')
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({ project_id: 2, status: 'blocked', is_key: true }))
    expect(currentUrl()).toBe('/deliverables?view=board&is_key=true&project_id=2&status=blocked')
    await user.click(screen.getByLabelText('Key deliverables only'))
    expect(currentUrl()).toBe('/deliverables?view=board&project_id=2&status=blocked')
  })

  it('keeps the focus and the list while typing (the list is not remounted)', async () => {
    const user = userEvent.setup()
    renderPage()
    const table = await screen.findByRole('table')
    const box = searchBox()
    await user.type(box, 'audit')
    await waitFor(() => expect(currentUrl()).toBe('/deliverables?search=audit'))
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({ search: 'audit' }))
    expect(searchBox()).toBe(box)
    expect(box).toHaveFocus()
    expect(screen.getByRole('table')).toBe(table)
    // A remounted list would load its project options again.
    expect(projectsApi.list).toHaveBeenCalledTimes(1)
  })

  it('hides the New deliverable button from viewers', async () => {
    renderPage('/deliverables', { role: 'viewer' })
    expect(screen.getByRole('heading', { level: 1, name: 'Deliverables' })).toBeInTheDocument()
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'New deliverable' })).not.toBeInTheDocument()
  })
})
