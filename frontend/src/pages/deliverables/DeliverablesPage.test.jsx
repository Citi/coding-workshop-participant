import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link } from 'react-router-dom'
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

function renderPage(route = '/deliverables', options = {}) {
  return renderWithProviders(
    <>
      <Link to="/deliverables">All deliverables</Link>
      <DeliverablesPage />
    </>,
    { route, path: '/deliverables', ...options },
  )
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

  it('resets to the new link when the URL changes', async () => {
    const user = userEvent.setup()
    renderPage('/deliverables?is_key=true')
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({ is_key: true }))
    await user.click(screen.getByRole('link', { name: 'All deliverables' }))
    await waitFor(() => expect(deliverablesApi.list).toHaveBeenLastCalledWith({}))
    expect(screen.getByLabelText('Key deliverables only')).not.toBeChecked()
  })

  it('hides the New deliverable button from viewers', async () => {
    renderPage('/deliverables', { role: 'viewer' })
    expect(screen.getByRole('heading', { level: 1, name: 'Deliverables' })).toBeInTheDocument()
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'New deliverable' })).not.toBeInTheDocument()
  })
})
