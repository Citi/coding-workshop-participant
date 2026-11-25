import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { allocationsApi } from '../../services/allocationsApi'
import { projectsApi } from '../../services/projectsApi'
import { resourcesApi } from '../../services/resourcesApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import AllocationsPanel from './AllocationsPanel'
import { APOLLO_TEAM, PRIYA_ALLOCATIONS, PROJECTS, RESOURCES, TOM_APOLLO, list } from './resourceFixtures'

vi.mock('../../services/allocationsApi', () => ({ allocationsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }))
vi.mock('../../services/resourcesApi', () => ({ resourcesApi: { list: vi.fn() } }))
vi.mock('../../services/projectsApi', () => ({ projectsApi: { list: vi.fn() } }))

/** The visual preview under the fields (null when there is none). */
const preview = (dialog) => dialog.querySelector('[data-testid="allocation-what-if"]')
/** The polite status message screen readers announce once the user pauses. */
const region = (dialog) => within(dialog).getByRole('status')

// End to end through the real panel, AllocationFormDialog and FormDialog (renderAfterFields).
describe('allocation what-if preview in the real dialog', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks()
    allocationsApi.list.mockResolvedValue(list(APOLLO_TEAM))
    resourcesApi.list.mockResolvedValue(list(RESOURCES))
    projectsApi.list.mockResolvedValue(list(PROJECTS))
  })

  it('project Team tab, create: appears once a person and a valid percent are chosen, warns above 100%, saving still works', async () => {
    allocationsApi.list.mockResolvedValue(list([TOM_APOLLO]))
    allocationsApi.create.mockResolvedValue({
      ...TOM_APOLLO,
      id: 20,
      resource_id: 4,
      resource_name: 'Priya Shah',
      allocation_percent: 10,
      resource_total_allocation_percent: 130,
      resource_over_allocated: true,
    })
    const user = userEvent.setup({ delay: null })
    renderWithProviders(<AllocationsPanel projectId={1} />)
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'New allocation' }))
    await screen.findByRole('button', { name: 'Create allocation' })
    const dialog = screen.getByRole('dialog', { name: 'New allocation' })
    const percent = within(dialog).getByLabelText(/Allocation \(%\)/)
    await user.type(percent, '10')
    expect(preview(dialog)).toBeNull() // person not chosen yet
    expect(region(dialog)).toBeEmptyDOMElement()
    await user.click(within(dialog).getByRole('combobox', { name: /Team member/ }))
    await user.click(await screen.findByRole('option', { name: 'Priya Shah (120% allocated)' }))
    expect(preview(dialog)).toHaveTextContent('Priya Shah: 120% now → 130% after this change')
    // Priya is above 100% already: the change keeps her over-allocated.
    expect(preview(dialog)).toHaveTextContent('Still over-allocated – more than 100% across active projects')
    expect(preview(dialog).closest('form')).toContainElement(percent) // under the fields, inside the form
    await waitFor(() =>
      expect(region(dialog)).toHaveTextContent(
        'Priya Shah: 120% now, 130% after this change. Still over-allocated – more than 100% across active projects.',
      ),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Create allocation' }))
    await waitFor(() => expect(allocationsApi.create).toHaveBeenCalledWith({ resource_id: 4, project_id: 1, allocation_percent: 10 }))
  })

  it('person page, edit: subtracts the original and updates while typing', async () => {
    allocationsApi.list.mockResolvedValue(list(PRIYA_ALLOCATIONS))
    const user = userEvent.setup({ delay: null })
    renderWithProviders(<AllocationsPanel resourceId={4} />)
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Edit allocation for Priya Shah on Apollo CRM' }))
    await screen.findByRole('button', { name: 'Save changes' })
    const dialog = screen.getByRole('dialog', { name: 'Edit allocation' })
    expect(preview(dialog)).toHaveTextContent('Priya Shah: 120% now → 120% after this change')
    // Already there when the dialog opens: nothing is announced until the user changes something.
    expect(region(dialog)).toHaveTextContent('Priya Shah: 120% now, 120% after this change.')
    const percent = within(dialog).getByLabelText(/Allocation \(%\)/)
    await user.clear(percent)
    expect(preview(dialog)).toBeNull()
    await user.type(percent, '40')
    expect(preview(dialog)).toHaveTextContent('Priya Shah: 120% now → 100% after this change')
    expect(preview(dialog)).toHaveTextContent('Within capacity')
    await waitFor(() => expect(region(dialog)).toHaveTextContent('Priya Shah: 120% now, 100% after this change. Within capacity.'))
  })
})
