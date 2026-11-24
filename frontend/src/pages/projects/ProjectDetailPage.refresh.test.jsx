import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allocationsApi } from '../../services/allocationsApi'
import { projectsApi } from '../../services/projectsApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { list, PRIYA_APOLLO } from '../resources/resourceFixtures'
import { APOLLO } from './projectFixtures'
import ProjectDetailPage from './ProjectDetailPage'

// The real Team panel (allocations), so the test sees what the user sees after editing the project.
vi.mock('../../services/projectsApi', () => ({
  projectsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('../../services/allocationsApi', () => ({
  allocationsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('../deliverables/DeliverablesPanel', () => ({ default: () => <p>Deliverables panel</p> }))
vi.mock('../budget/ExpensesPanel', () => ({ default: () => <p>Expenses panel</p> }))

describe('ProjectDetailPage tabs after a project edit', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('reloads the open tab, so team totals that depend on the project status are current', async () => {
    // Priya is 60% on Apollo and 60% on another active project (120%). Only active projects count
    // towards her total, so putting Apollo on hold brings her down to 60%.
    const onHold = { ...APOLLO, status: 'on_hold' }
    projectsApi.get.mockResolvedValueOnce(APOLLO).mockResolvedValue(onHold)
    projectsApi.update.mockResolvedValue(onHold)
    allocationsApi.list
      .mockResolvedValueOnce(list([PRIYA_APOLLO]))
      .mockResolvedValue(
        list([{ ...PRIYA_APOLLO, project_status: 'on_hold', resource_total_allocation_percent: 60, resource_over_allocated: false }]),
      )
    const user = userEvent.setup({ delay: null })
    renderWithProviders(<ProjectDetailPage />, { route: '/projects/1', path: '/projects/:projectId' })

    await screen.findByRole('heading', { level: 1, name: 'Apollo CRM' })
    await user.click(screen.getByRole('tab', { name: 'Team' }))
    const team = await screen.findByRole('table', { name: 'Team allocations' })
    expect(within(team).getByText('Over-allocated')).toBeInTheDocument()
    expect(within(team).getByRole('progressbar', { name: '120%' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit project' })
    await user.click(within(dialog).getByRole('combobox', { name: /Status/ }))
    await user.click(await screen.findByRole('option', { name: 'On hold' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Project updated')).toBeInTheDocument()
    await waitFor(() => expect(allocationsApi.list).toHaveBeenCalledTimes(2))
    expect(allocationsApi.list).toHaveBeenLastCalledWith({ project_id: 1 })
    const refreshed = await screen.findByRole('table', { name: 'Team allocations' })
    expect(within(refreshed).getAllByRole('progressbar', { name: '60%' })).toHaveLength(2)
    expect(screen.queryByText('Over-allocated')).not.toBeInTheDocument()
  })
})
