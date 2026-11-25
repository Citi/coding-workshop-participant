import { useState } from 'react'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../services/apiClient'
import { projectsApi } from '../../services/projectsApi'
import { resourcesApi } from '../../services/resourcesApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import AllocationFormDialog, { ANNOUNCE_DELAY_MS, AllocationWhatIf } from './AllocationFormDialog'
import { APOLLO, APOLLO_TEAM, HERMES, MARIA, PRIYA, PRIYA_APOLLO, PRIYA_HERMES, PROJECTS, RESOURCES, TOM, TOM_APOLLO, ZEUS, list } from './resourceFixtures'

vi.mock('../../services/resourcesApi', () => ({ resourcesApi: { list: vi.fn() } }))
vi.mock('../../services/projectsApi', () => ({ projectsApi: { list: vi.fn() } }))

// The real FormDialog renders the form; the spy keeps its latest props to check what the dialog hands it.
const formDialog = vi.hoisted(() => ({ props: null }))
vi.mock('../../components/FormDialog', async (importOriginal) => {
  const { default: FormDialog } = await importOriginal()
  return {
    default: function FormDialogSpy(props) {
      formDialog.props = props
      return <FormDialog {...props} />
    },
  }
})

const WARNING_AMBER = 'rgb(180, 83, 9)'
const OVER_ALLOCATED = 'Will be over-allocated – more than 100% across active projects'
const STILL_OVER_ALLOCATED = 'Still over-allocated – more than 100% across active projects'
const WITHIN_CAPACITY = 'Within capacity'

/** The visual preview (hidden from screen readers, which get the status message instead). */
const summaryIn = (container) => container.querySelector('[data-testid="allocation-what-if"]')
/** The polite status message screen readers announce once the user pauses. */
const liveRegionIn = (container) => container.querySelector('[role="status"][aria-live="polite"]')

/**
 * The what-if with the form's loaded options (Maria 0%, Priya 120%, Tom 40%; Apollo and Zeus are
 * active, Hermes is planned). Returns the render result plus the what-if's preview and live region.
 */
function renderWhatIf(props) {
  const view = renderWithProviders(<AllocationWhatIf resources={RESOURCES} projects={PROJECTS} {...props} />)
  return { ...view, summary: summaryIn(view.container), region: liveRegionIn(view.container) }
}

/** Stands in for the form: the what-if re-renders with each keystroke, as it does under the fields. */
function TypedPercent(props) {
  const [percent, setPercent] = useState('')
  return (
    <>
      <label>
        Allocation (%)
        <input type="number" value={percent} onChange={(event) => setPercent(event.target.value)} />
      </label>
      <AllocationWhatIf resources={RESOURCES} projects={PROJECTS} {...props} percent={percent} />
    </>
  )
}

describe('AllocationWhatIf', () => {
  it('shows the new total of a person added to an active project, within capacity', () => {
    const { summary } = renderWhatIf({ resourceId: MARIA.id, projectId: APOLLO.id, percent: '50' })
    expect(summary).toHaveTextContent('Maria Garcia: 0% now → 50% after this change')
    expect(summary).toHaveTextContent(WITHIN_CAPACITY)
    expect(summary).not.toHaveTextContent('over-allocated')
    expect(summary).not.toHaveTextContent('does not count')
  })

  it('is within capacity at exactly 100%', () => {
    const { summary } = renderWhatIf({ resourceId: TOM.id, projectId: ZEUS.id, percent: '60' })
    expect(summary).toHaveTextContent('Tom Lee: 40% now → 100% after this change')
    expect(summary).toHaveTextContent(WITHIN_CAPACITY)
    expect(screen.queryByText(OVER_ALLOCATED)).not.toBeInTheDocument()
  })

  it('warns, with an icon and words, when the change takes the person above 100%', () => {
    const { summary } = renderWhatIf({ resourceId: TOM.id, projectId: ZEUS.id, percent: '61' })
    expect(summary).toHaveTextContent('Tom Lee: 40% now → 101% after this change')
    const warning = within(summary).getByText(OVER_ALLOCATED)
    expect(getComputedStyle(warning).color).toBe(WARNING_AMBER)
    expect(warning.parentElement.querySelector('[data-testid="WarningAmberIcon"]')).toHaveAttribute('aria-hidden', 'true')
    expect(summary).not.toHaveTextContent(WITHIN_CAPACITY)
  })

  it('subtracts the allocation being edited, which is already part of the total', () => {
    const { summary } = renderWhatIf({ allocation: PRIYA_APOLLO, resourceId: PRIYA.id, projectId: APOLLO.id, percent: '40' })
    expect(summary).toHaveTextContent('Priya Shah: 120% now → 100% after this change')
    expect(summary).toHaveTextContent(WITHIN_CAPACITY)
  })

  it('shows an unchanged total when an edit keeps the percentage, saying the person is still over-allocated', () => {
    const { summary } = renderWhatIf({ allocation: PRIYA_APOLLO, resourceId: PRIYA.id, projectId: APOLLO.id, percent: '60' })
    expect(summary).toHaveTextContent('Priya Shah: 120% now → 120% after this change')
    // Already above 100% before the change: "Will be over-allocated" would blame this change.
    expect(summary).toHaveTextContent(STILL_OVER_ALLOCATED)
    expect(summary).not.toHaveTextContent(OVER_ALLOCATED)
  })

  it('says "still over-allocated" when a change adds to the load of someone already above 100%', () => {
    const { summary } = renderWhatIf({ resourceId: PRIYA.id, projectId: ZEUS.id, percent: '10' })
    expect(summary).toHaveTextContent('Priya Shah: 120% now → 130% after this change')
    expect(within(summary).getByText(STILL_OVER_ALLOCATED)).toHaveStyle({ color: WARNING_AMBER })
  })

  it('explains that a project that is not active does not count toward the load', () => {
    const { summary } = renderWhatIf({ resourceId: MARIA.id, projectId: HERMES.id, percent: '50' })
    expect(summary).toHaveTextContent('Maria Garcia: 0% now → 0% after this change')
    expect(summary).toHaveTextContent(
      "Hermes Portal is planned, so this allocation does not count toward Maria Garcia's load (only active projects do).",
    )
    expect(summary).toHaveTextContent(WITHIN_CAPACITY)
  })

  it('does not subtract an edited allocation whose project is not active (it was never counted)', () => {
    const { summary } = renderWhatIf({ allocation: PRIYA_HERMES, resourceId: PRIYA.id, projectId: HERMES.id, percent: '50' })
    expect(summary).toHaveTextContent('Priya Shah: 120% now → 120% after this change')
    expect(summary).toHaveTextContent('does not count toward')
    expect(summary).toHaveTextContent(STILL_OVER_ALLOCATED)
  })

  it('uses the status from the loaded projects for the allocation being edited', () => {
    // Apollo was put on hold since the list was loaded: its 60% is no longer part of Priya's total.
    const projects = [{ ...APOLLO, status: 'on_hold' }, HERMES, ZEUS]
    const { summary } = renderWhatIf({ projects, allocation: PRIYA_APOLLO, resourceId: PRIYA.id, projectId: ZEUS.id, percent: '10' })
    expect(summary).toHaveTextContent('Priya Shah: 120% now → 130% after this change')
  })

  it('moves the old share when an edit changes the project or the person', () => {
    const moved = renderWhatIf({ allocation: TOM_APOLLO, resourceId: TOM.id, projectId: HERMES.id, percent: '40' })
    expect(moved.summary).toHaveTextContent('Tom Lee: 40% now → 0% after this change')
    expect(moved.summary).toHaveTextContent('Hermes Portal is planned')
    moved.unmount()

    // Maria's total does not include Tom's allocation, so nothing is subtracted.
    const { summary } = renderWhatIf({ allocation: TOM_APOLLO, resourceId: MARIA.id, projectId: APOLLO.id, percent: '40' })
    expect(summary).toHaveTextContent('Maria Garcia: 0% now → 40% after this change')
  })

  it.each([
    ['a person', { resourceId: '', projectId: APOLLO.id, percent: '50' }],
    ['a project', { resourceId: TOM.id, projectId: '', percent: '50' }],
    ['a percentage', { resourceId: TOM.id, projectId: APOLLO.id, percent: '' }],
  ])('shows nothing until %s is chosen', (_missing, props) => {
    const { summary, region } = renderWhatIf(props)
    expect(summary).toBeNull()
    expect(region).toBeEmptyDOMElement()
  })

  it.each(['0', '101', '12.5', '-5', 'abc', ' '])('shows nothing for a percentage the form would not save (%j)', (percent) => {
    const { summary, region } = renderWhatIf({ resourceId: TOM.id, projectId: ZEUS.id, percent })
    expect(summary).toBeNull()
    expect(region).toBeEmptyDOMElement()
  })

  it('shows nothing for a person or project missing from the loaded lists', () => {
    const unknown = renderWhatIf({ resourceId: 99, projectId: APOLLO.id, percent: '50' })
    expect(unknown.summary).toBeNull()
    expect(unknown.region).toBeEmptyDOMElement()
    unknown.unmount()
    const { summary, region } = renderWhatIf({ resources: undefined, projects: undefined, resourceId: TOM.id, projectId: APOLLO.id, percent: '50' })
    expect(summary).toBeNull()
    expect(region).toBeEmptyDOMElement()
  })

  it('gives screen readers the what-if in words, from a polite status message instead of the preview', () => {
    const { summary, region } = renderWhatIf({ resourceId: TOM.id, projectId: ZEUS.id, percent: '61' })
    // The preview is for the eyes; reading it as well would say everything twice ("→" as "right arrow").
    expect(summary).toHaveAttribute('aria-hidden', 'true')
    expect(region).toHaveAttribute('aria-atomic', 'true')
    expect(region).toHaveStyle({ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }) // visually hidden
    expect(region).toHaveTextContent(/^Tom Lee: 40% now, 101% after this change\. Will be over-allocated – more than 100% across active projects\.$/)
    expect(screen.getByRole('status')).toBe(region)
  })

  it('words the note about a project that is not active in the status message too', () => {
    const { region } = renderWhatIf({ allocation: PRIYA_HERMES, resourceId: PRIYA.id, projectId: HERMES.id, percent: '50' })
    expect(region).toHaveTextContent(
      "Priya Shah: 120% now, 120% after this change. Hermes Portal is planned, so this allocation does not count toward Priya Shah's " +
        'load (only active projects do). Still over-allocated – more than 100% across active projects.',
    )
  })

  describe('while the user types', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    /** The texts the status message took, in order (what screen readers would announce). */
    function recordAnnouncements(region) {
      const texts = []
      const observer = new MutationObserver(() => texts.push(region.textContent))
      observer.observe(region, { subtree: true, childList: true, characterData: true })
      return texts
    }

    it('updates the preview at every keystroke but announces only once the user pauses', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { container } = renderWithProviders(<TypedPercent resourceId={TOM.id} projectId={ZEUS.id} />)
      const region = liveRegionIn(container)
      const announced = recordAnnouncements(region)
      const input = screen.getByLabelText('Allocation (%)')

      await user.type(input, '6')
      expect(summaryIn(container)).toHaveTextContent('Tom Lee: 40% now → 46% after this change')
      await user.type(input, '0')
      expect(summaryIn(container)).toHaveTextContent('Tom Lee: 40% now → 100% after this change')
      expect(region).toBeEmptyDOMElement() // nothing announced while typing

      // Async act also runs the observer's callback (a microtask) before the checks.
      await act(async () => vi.advanceTimersByTime(ANNOUNCE_DELAY_MS))
      expect(region).toHaveTextContent('Tom Lee: 40% now, 100% after this change. Within capacity.')
      // "46%" was never announced: one message for the whole number.
      expect(announced).toEqual(['Tom Lee: 40% now, 100% after this change. Within capacity.'])
      expect(liveRegionIn(container)).toBe(region)
    })

    it('empties the status message once the percentage is no longer valid, and announces the next one', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { container } = renderWithProviders(<TypedPercent resourceId={TOM.id} projectId={ZEUS.id} />)
      const region = liveRegionIn(container)
      const input = screen.getByLabelText('Allocation (%)')

      await user.type(input, '100')
      act(() => vi.advanceTimersByTime(ANNOUNCE_DELAY_MS))
      expect(region).toHaveTextContent('Tom Lee: 40% now, 140% after this change. Will be over-allocated')

      await user.type(input, '0') // 1000%: not a percentage the form would save
      expect(summaryIn(container)).toBeNull()
      act(() => vi.advanceTimersByTime(ANNOUNCE_DELAY_MS))
      expect(region).toBeEmptyDOMElement()

      await user.clear(input)
      await user.type(input, '70')
      act(() => vi.advanceTimersByTime(ANNOUNCE_DELAY_MS))
      expect(region).toHaveTextContent('Tom Lee: 40% now, 110% after this change. Will be over-allocated')
    })
  })
})

describe('AllocationFormDialog', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.resetAllMocks()
    formDialog.props = null
    resourcesApi.list.mockResolvedValue(list(RESOURCES))
    projectsApi.list.mockResolvedValue(list(PROJECTS))
  })

  function renderDialog(props = {}) {
    const handlers = { onClose: vi.fn(), onSubmit: vi.fn().mockResolvedValue() }
    renderWithProviders(<AllocationFormDialog open existing={[]} {...handlers} {...props} />)
    return { ...handlers, user: userEvent.setup({ delay: null }) }
  }

  /** Waits until the form (not the loading dialog) is shown and returns it. */
  async function findForm(submitLabel, dialogName) {
    await screen.findByRole('button', { name: submitLabel })
    return screen.getByRole('dialog', { name: dialogName })
  }

  /** What the form shows under its fields for some entered values (the what-if's preview, null when none). */
  function shownUnderFields(values) {
    const { container } = renderWithProviders(formDialog.props.renderAfterFields(values))
    return summaryIn(container)
  }

  it('loads the people and projects to pick from while showing a loading dialog', async () => {
    renderDialog({ projectId: APOLLO.id, existing: APOLLO_TEAM })
    expect(within(screen.getByRole('dialog', { name: 'New allocation' })).getByRole('status')).toHaveTextContent('Loading form')
    const form = await findForm('Create allocation', 'New allocation')
    expect(resourcesApi.list).toHaveBeenCalledTimes(1)
    expect(projectsApi.list).toHaveBeenCalledTimes(1)
    expect(form).toHaveTextContent('Add a team member to this project.')
  })

  it('does not load anything while closed', () => {
    renderDialog({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(resourcesApi.list).not.toHaveBeenCalled()
  })

  it('offers Retry and Cancel when the options cannot be loaded', async () => {
    resourcesApi.list.mockRejectedValueOnce(new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' }))
    const { user, onClose } = renderDialog({ resourceId: TOM.id })
    const loading = screen.getByRole('dialog', { name: 'New allocation' })
    expect(await within(loading).findByText(/Could not load the form/)).toBeInTheDocument()
    await user.click(within(loading).getByRole('button', { name: 'Retry' }))
    const form = await findForm('Create allocation', 'New allocation')
    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('hands the form a what-if of the values entered so far (project team: the person is picked)', async () => {
    renderDialog({ projectId: APOLLO.id, existing: APOLLO_TEAM })
    await findForm('Create allocation', 'New allocation')
    expect(formDialog.props.initialValues).toEqual({ resource_id: undefined, project_id: APOLLO.id })
    expect(shownUnderFields({ resource_id: '', project_id: APOLLO.id, allocation_percent: '50' })).toBeNull()
    expect(shownUnderFields({ resource_id: MARIA.id, project_id: APOLLO.id, allocation_percent: '50' })).toHaveTextContent(
      'Maria Garcia: 0% now → 50% after this change',
    )
  })

  it('hands the form a what-if of the values entered so far (person page: the project is picked)', async () => {
    renderDialog({ resourceId: TOM.id, existing: [TOM_APOLLO] })
    await findForm('Create allocation', 'New allocation')
    const region = shownUnderFields({ resource_id: TOM.id, project_id: ZEUS.id, allocation_percent: '70' })
    expect(region).toHaveTextContent('Tom Lee: 40% now → 110% after this change')
    expect(region).toHaveTextContent(OVER_ALLOCATED)
  })

  it('takes the allocation being edited into account', async () => {
    renderDialog({ allocation: PRIYA_APOLLO, resourceId: PRIYA.id, existing: [PRIYA_APOLLO, PRIYA_HERMES] })
    await findForm('Save changes', 'Edit allocation')
    expect(formDialog.props.initialValues).toBe(PRIYA_APOLLO)
    expect(shownUnderFields({ resource_id: PRIYA.id, project_id: APOLLO.id, allocation_percent: '40' })).toHaveTextContent(
      'Priya Shah: 120% now → 100% after this change',
    )
  })

  it('never blocks saving an allocation that over-allocates the person', async () => {
    const { user, onSubmit } = renderDialog({ resourceId: TOM.id, existing: [TOM_APOLLO] })
    const form = await findForm('Create allocation', 'New allocation')
    await user.click(within(form).getByRole('combobox', { name: /Project/ }))
    await user.click(await screen.findByRole('option', { name: 'Zeus ERP (Active)' }))
    await user.type(within(form).getByLabelText(/Allocation \(%\)/), '100')
    await user.click(within(form).getByRole('button', { name: 'Create allocation' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ resource_id: TOM.id, project_id: ZEUS.id, allocation_percent: 100 }))
  })
})
