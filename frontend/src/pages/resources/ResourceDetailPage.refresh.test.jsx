import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allocationsApi } from '../../services/allocationsApi'
import { resourcesApi } from '../../services/resourcesApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import ResourceDetailPage from './ResourceDetailPage'
import { list, PRIYA_ALLOCATIONS, PRIYA_DETAILS } from './resourceFixtures'

// The real allocations panel, so the test sees what the user sees after editing the person.
vi.mock('../../services/resourcesApi', () => ({
  resourcesApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('../../services/allocationsApi', () => ({
  allocationsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

describe('ResourceDetailPage allocations after a person edit', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('reloads the allocations, so their buttons and delete confirmation use the new name', async () => {
    const renamed = { ...PRIYA_DETAILS, full_name: 'Priya Patel' }
    resourcesApi.get.mockResolvedValueOnce(PRIYA_DETAILS).mockResolvedValue(renamed)
    resourcesApi.update.mockResolvedValue(renamed)
    allocationsApi.list
      .mockResolvedValueOnce(list(PRIYA_ALLOCATIONS))
      .mockResolvedValue(list(PRIYA_ALLOCATIONS.map((allocation) => ({ ...allocation, resource_name: 'Priya Patel' }))))
    const user = userEvent.setup({ delay: null })
    renderWithProviders(<ResourceDetailPage />, { route: '/resources/4', path: '/resources/:resourceId' })

    await screen.findByRole('heading', { level: 1, name: 'Priya Shah' })
    await screen.findByRole('table', { name: 'Project allocations' })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit resource' })
    const fullName = within(dialog).getByLabelText(/Full name/)
    await user.clear(fullName)
    await user.type(fullName, 'Priya Patel')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Resource updated')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Priya Patel' })).toBeInTheDocument()
    await waitFor(() => expect(allocationsApi.list).toHaveBeenCalledTimes(2))
    expect(allocationsApi.list).toHaveBeenLastCalledWith({ resource_id: 4 })

    await user.click(await screen.findByRole('button', { name: 'Delete allocation for Priya Patel on Apollo CRM' }))
    expect(screen.getByRole('dialog', { name: 'Delete allocation?' })).toHaveTextContent(
      'Priya Patel will no longer be allocated to Apollo CRM (60%).',
    )
  })
})
