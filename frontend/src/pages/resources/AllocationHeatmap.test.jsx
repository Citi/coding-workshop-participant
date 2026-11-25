import { useCallback, useState } from 'react'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApiQuery } from '../../hooks/useApiQuery'
import { allocationsApi } from '../../services/allocationsApi'
import { ApiError } from '../../services/apiClient'
import { resourcesApi } from '../../services/resourcesApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import AllocationHeatmap from './AllocationHeatmap'
import { HEAT_STEPS, MUTED_BACKGROUND, OVER_ALLOCATED_BACKGROUND } from './heatmapGrid'
import { list, MARIA, PRIYA, PRIYA_APOLLO, PRIYA_HERMES, PRIYA_ZEUS, RESOURCES, TOM, TOM_APOLLO } from './resourceFixtures'

vi.mock('../../services/resourcesApi', () => ({ resourcesApi: { list: vi.fn() } }))
vi.mock('../../services/allocationsApi', () => ({ allocationsApi: { list: vi.fn() } }))

/** GET /allocations: everyone's, sorted by project name, then person. */
const ALL_ALLOCATIONS = [PRIYA_APOLLO, TOM_APOLLO, PRIYA_HERMES, PRIYA_ZEUS]
const RULE = "Only active projects count toward a person's load; more than 100% is over-allocated."
const ALL_HEADERS = ['Team member', 'Apollo CRM Active', 'Zeus ERP Active', 'Hermes Portal Planned – not counted', 'Total (active)']

/** The buttons (after the heat map) change the filters like the Resources page's filter bar. */
function FilterButtons({ filters, setFilters }) {
  return (
    <>
      <button type="button" onClick={() => setFilters({ over_allocated: true })}>
        Over-allocated only
      </button>
      <button type="button" onClick={() => setFilters({ search: 'tom' })}>
        Search tom
      </button>
      <button type="button" onClick={() => setFilters({ ...filters })}>
        Same filters again
      </button>
    </>
  )
}

/** The filters arrive as on the Resources page, without its people: the heat map loads them itself. */
function Harness({ initialFilters = {}, ...props }) {
  const [filters, setFilters] = useState(initialFilters)
  return (
    <>
      <AllocationHeatmap filters={filters} {...props} />
      <FilterButtons filters={filters} setFilters={setFilters} />
    </>
  )
}

/** As the Resources page: it loads the people (GET /resources with its filters) and passes them on. */
function PageHarness({ initialFilters = {}, ...props }) {
  const [filters, setFilters] = useState(initialFilters)
  const fetchResources = useCallback(() => resourcesApi.list(filters), [filters])
  const { data, loading, error, reload } = useApiQuery(fetchResources)
  return (
    <>
      <AllocationHeatmap
        filters={filters}
        resources={data?.items}
        resourcesLoading={loading}
        resourcesError={error}
        onRetry={reload}
        {...props}
      />
      <FilterButtons filters={filters} setFilters={setFilters} />
    </>
  )
}

function renderHeatmap(props = {}, HarnessComponent = Harness) {
  renderWithProviders(<HarnessComponent {...props} />, {
    route: '/resources?view=heatmap',
    path: '/resources',
    extraRoutes: [
      { path: '/resources/:resourceId', element: <p>Resource detail page</p> },
      { path: '/projects/:projectId', element: <p>Project detail page</p> },
    ],
  })
  return userEvent.setup({ delay: null })
}

/** A response the test sends itself, to look at the screen while the request is still running. */
function deferred() {
  let resolve
  const promise = new Promise((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

const findHeatmap = () => screen.findByRole('table', { name: RULE })
const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent)
const rowNames = () => screen.getAllByRole('rowheader').map((header) => header.textContent)
const rowOf = (name) => screen.getByRole('rowheader', { name }).closest('tr')
const cellsOf = (name) => within(rowOf(name)).getAllByRole('cell')
const cellTexts = (name) => cellsOf(name).map((cell) => cell.textContent)
const databaseDown = () => new ApiError({ status: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' })

describe('AllocationHeatmap', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resourcesApi.list.mockResolvedValue(list(RESOURCES))
    allocationsApi.list.mockResolvedValue(list(ALL_ALLOCATIONS))
  })

  it('loads the people with the filters and every allocation, then shows a table captioned with the rule', async () => {
    renderHeatmap({ initialFilters: { search: 'IT', over_allocated: true } })
    expect(screen.getByRole('status')).toHaveTextContent('Loading the heat map')
    const table = await findHeatmap()
    expect(resourcesApi.list).toHaveBeenCalledWith({ search: 'IT', over_allocated: true })
    expect(allocationsApi.list).toHaveBeenCalledWith()
    expect(within(table).getByText(RULE).closest('caption')).toBeInTheDocument()

    const region = screen.getByRole('region', { name: 'Allocation heat map' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toContainElement(table)
  })

  it('has a column per project: the active ones, then the others marked "not counted", then the totals', async () => {
    renderHeatmap()
    await findHeatmap()
    expect(headers()).toEqual(ALL_HEADERS)
    screen.getAllByRole('columnheader').forEach((header) => expect(header).toHaveAttribute('scope', 'col'))
    const hermes = screen.getByRole('columnheader', { name: /Hermes Portal/ })
    expect(within(hermes).getByRole('link', { name: 'Hermes Portal' })).toHaveAttribute('href', '/projects/3')
    expect(screen.getByRole('link', { name: 'Apollo CRM' })).toHaveAttribute('href', '/projects/1')
  })

  it('names each project column by the project and its status, as separate words', async () => {
    renderHeatmap()
    await findHeatmap()
    // Screen readers announce the column header with each cell: "Apollo CRMActive" would run together.
    expect(screen.getByRole('columnheader', { name: 'Apollo CRM Active' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Hermes Portal Planned – not counted' })).toBeInTheDocument()
  })

  it('has a row per person, by name, each name linking to their page', async () => {
    const user = renderHeatmap()
    await findHeatmap()
    expect(rowNames()).toEqual(['Maria Garcia', 'Priya Shah', 'Tom Lee'])
    screen.getAllByRole('rowheader').forEach((header) => expect(header).toHaveAttribute('scope', 'row'))
    expect(screen.getByRole('link', { name: 'Priya Shah' })).toHaveAttribute('href', '/resources/4')

    await user.click(screen.getByRole('link', { name: 'Tom Lee' }))
    expect(await screen.findByText('Resource detail page')).toBeInTheDocument()
  })

  it('opens a project from its column header', async () => {
    const user = renderHeatmap()
    await findHeatmap()
    await user.click(screen.getByRole('link', { name: 'Zeus ERP' }))
    expect(await screen.findByText('Project detail page')).toBeInTheDocument()
  })

  it("shows each allocation in its cell and each person's total over active projects", async () => {
    renderHeatmap()
    await findHeatmap()
    // Priya's 30% on the planned Hermes Portal is shown but not counted: 60 + 60 = 120.
    expect(cellTexts('Priya Shah')).toEqual(['60%', '60%', '30%', '120%Over-allocated'])
    expect(cellTexts('Tom Lee')).toEqual(['40%', 'Not allocated', 'Not allocated', '40%'])
    expect(cellTexts('Maria Garcia')).toEqual(['Not allocated', 'Not allocated', 'Not allocated', '0%'])
  })

  it('says "Over-allocated" next to a total above 100%, but not at exactly 100%', async () => {
    const fullTimeTom = { ...TOM, total_allocation_percent: 100 }
    resourcesApi.list.mockResolvedValue(list([MARIA, PRIYA, fullTimeTom]))
    allocationsApi.list.mockResolvedValue(list([PRIYA_APOLLO, { ...TOM_APOLLO, allocation_percent: 100 }, PRIYA_HERMES, PRIYA_ZEUS]))
    renderHeatmap()
    await findHeatmap()

    const priyaTotal = cellsOf('Priya Shah').at(-1)
    expect(within(priyaTotal).getByText('120%')).toBeInTheDocument()
    expect(within(priyaTotal).getByText('Over-allocated')).toBeInTheDocument()
    const tomTotal = cellsOf('Tom Lee').at(-1)
    expect(tomTotal).toHaveTextContent('100%')
    expect(within(tomTotal).queryByText('Over-allocated')).not.toBeInTheDocument()
    expect(screen.getAllByText('Over-allocated')).toHaveLength(1)
  })

  it('shades the counted cells by percentage and greys out the projects that do not count', async () => {
    renderHeatmap()
    await findHeatmap()
    const [priyaApollo, priyaZeus, priyaHermes, priyaTotal] = cellsOf('Priya Shah')
    expect(priyaApollo).toHaveStyle({ backgroundColor: HEAT_STEPS[2].background })
    expect(priyaZeus).toHaveStyle({ backgroundColor: HEAT_STEPS[2].background })
    expect(cellsOf('Tom Lee')[0]).toHaveStyle({ backgroundColor: HEAT_STEPS[1].background })
    expect(priyaHermes).toHaveStyle({ backgroundColor: MUTED_BACKGROUND })
    expect(cellsOf('Tom Lee')[2]).toHaveStyle({ backgroundColor: MUTED_BACKGROUND })
    expect(screen.getByRole('columnheader', { name: /Hermes Portal/ })).toHaveStyle({ backgroundColor: MUTED_BACKGROUND })
    expect(priyaTotal).toHaveStyle({ backgroundColor: OVER_ALLOCATED_BACKGROUND })
    expect(cellsOf('Tom Lee').at(-1)).not.toHaveStyle({ backgroundColor: OVER_ALLOCATED_BACKGROUND })
  })

  it('explains the shades in a legend', async () => {
    renderHeatmap()
    await findHeatmap()
    const legend = screen.getByRole('list', { name: 'Shading by allocation:' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1–25%',
      '26–50%',
      '51–75%',
      '76–100%',
      'Project not active – not counted',
    ])
  })

  it('lets keyboard users reach the scroll area, then the links inside it', async () => {
    const user = renderHeatmap()
    await findHeatmap()
    await user.tab()
    expect(screen.getByRole('region', { name: 'Allocation heat map' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Apollo CRM' })).toHaveFocus()
  })

  it('shows the error with a Retry button that loads both lists again', async () => {
    resourcesApi.list.mockRejectedValueOnce(databaseDown())
    const user = renderHeatmap()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the heat map. Database unavailable')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await findHeatmap()).toBeInTheDocument()
    expect(resourcesApi.list).toHaveBeenCalledTimes(2)
    expect(allocationsApi.list).toHaveBeenCalledTimes(2)
  })

  it('shows the error when the allocations cannot be loaded', async () => {
    allocationsApi.list.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected server error' }))
    const user = renderHeatmap()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the heat map. Unexpected server error')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await findHeatmap()).toBeInTheDocument()
  })

  it.each([
    [{}, 'No resources yet', 'Team members will appear here once they are added.'],
    [{ search: 'zzz' }, 'No matching resources', 'No team member matches these filters. Try changing or clearing them.'],
  ])('shows an empty state when no one is listed (filters %o)', async (initialFilters, title, message) => {
    resourcesApi.list.mockResolvedValue(list([]))
    renderHeatmap({ initialFilters })
    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the empty texts and action the page passes', async () => {
    resourcesApi.list.mockResolvedValue(list([]))
    renderHeatmap({
      emptyTitle: 'Nobody here',
      emptyMessage: 'Add the first team member.',
      emptyAction: <button type="button">New resource</button>,
    })
    expect(await screen.findByText('Nobody here')).toBeInTheDocument()
    expect(screen.getByText('Add the first team member.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New resource' })).toBeInTheDocument()
  })

  it.each([
    [{}, 'Allocate team members to projects to see who works on what.'],
    [{ search: 'maria' }, 'No one in this list is allocated to a project yet.'],
  ])('says so when none of the people listed is allocated to a project (filters %o)', async (initialFilters, message) => {
    allocationsApi.list.mockResolvedValue(list([]))
    renderHeatmap({ initialFilters })
    expect(await screen.findByText('No allocations to show')).toBeInTheDocument()
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('loads the people again when the filters change, keeping the grid on screen meanwhile', async () => {
    const user = renderHeatmap()
    await findHeatmap()
    const response = deferred()
    resourcesApi.list.mockReturnValueOnce(response.promise)
    await user.click(screen.getByRole('button', { name: 'Over-allocated only' }))
    expect(await screen.findByRole('progressbar', { name: 'Refreshing' })).toBeInTheDocument()
    expect(resourcesApi.list).toHaveBeenLastCalledWith({ over_allocated: true })
    expect(rowNames()).toEqual(['Maria Garcia', 'Priya Shah', 'Tom Lee'])

    await act(async () => response.resolve(list([PRIYA])))
    await waitFor(() => expect(rowNames()).toEqual(['Priya Shah']))
    expect(screen.queryByRole('progressbar', { name: 'Refreshing' })).not.toBeInTheDocument()
    expect(headers()).toEqual(ALL_HEADERS)

    // Only the projects of the people listed get a column.
    resourcesApi.list.mockResolvedValueOnce(list([TOM]))
    await user.click(screen.getByRole('button', { name: 'Search tom' }))
    await waitFor(() => expect(rowNames()).toEqual(['Tom Lee']))
    expect(headers()).toEqual(['Team member', 'Apollo CRM Active', 'Total (active)'])
    // Every allocation is loaded once: the filters only change the people.
    expect(allocationsApi.list).toHaveBeenCalledTimes(1)
  })

  it('does not load again for a new filters object with the same values', async () => {
    const user = renderHeatmap({ initialFilters: { search: 'priya' } })
    await findHeatmap()
    await user.click(screen.getByRole('button', { name: 'Same filters again' }))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(resourcesApi.list).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('progressbar', { name: 'Refreshing' })).not.toBeInTheDocument()
  })

  it('keeps the grid and offers Retry when the people for new filters cannot be loaded', async () => {
    const user = renderHeatmap()
    await findHeatmap()
    resourcesApi.list.mockRejectedValueOnce(databaseDown())
    await user.click(screen.getByRole('button', { name: 'Over-allocated only' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh the heat map. Database unavailable')
    expect(screen.getByRole('table', { name: RULE })).toBeInTheDocument()

    resourcesApi.list.mockResolvedValueOnce(list([PRIYA]))
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(rowNames()).toEqual(['Priya Shah']))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('warns, with a Reload button, when the totals and the allocations were loaded at different moments', async () => {
    // Priya's allocation to Zeus ERP was added between the two requests: the API's total is still 60%.
    resourcesApi.list.mockResolvedValueOnce(list([MARIA, { ...PRIYA, total_allocation_percent: 60, is_over_allocated: false }, TOM]))
    const user = renderHeatmap()
    await findHeatmap()
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('The allocations changed while the heat map was loading, so some figures may be out of date.')
    // The row stays readable: its total is the sum of the cells shown.
    expect(cellsOf('Priya Shah').at(-1)).toHaveTextContent('120%Over-allocated')

    await user.click(within(notice).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.queryByText(/The allocations changed/)).not.toBeInTheDocument())
    expect(resourcesApi.list).toHaveBeenCalledTimes(2)
    expect(allocationsApi.list).toHaveBeenCalledTimes(2)
    expect(cellsOf('Priya Shah').at(-1)).toHaveTextContent('120%Over-allocated')
  })
})

describe('AllocationHeatmap with the people loaded by the page', () => {
  const renderInPage = (props) => renderHeatmap(props, PageHarness)

  beforeEach(() => {
    vi.resetAllMocks()
    resourcesApi.list.mockResolvedValue(list(RESOURCES))
    allocationsApi.list.mockResolvedValue(list(ALL_ALLOCATIONS))
  })

  it("shows the page's people without loading them again, and loads every allocation", async () => {
    renderInPage({ initialFilters: { department: 'IT', over_allocated: true } })
    expect(screen.getByRole('status')).toHaveTextContent('Loading the heat map')
    await findHeatmap()
    expect(rowNames()).toEqual(['Maria Garcia', 'Priya Shah', 'Tom Lee'])
    expect(cellTexts('Priya Shah')).toEqual(['60%', '60%', '30%', '120%Over-allocated'])
    // The page's request is the only GET /resources.
    expect(resourcesApi.list.mock.calls).toEqual([[{ department: 'IT', over_allocated: true }]])
    expect(allocationsApi.list.mock.calls).toEqual([[]])
  })

  it('does not load the people when it is given just the list', async () => {
    renderHeatmap({ resources: [PRIYA, TOM] })
    await findHeatmap()
    expect(rowNames()).toEqual(['Priya Shah', 'Tom Lee'])
    expect(resourcesApi.list).not.toHaveBeenCalled()
  })

  it("shows the page's error, with a Retry that loads the people (through the page) and the allocations again", async () => {
    resourcesApi.list.mockRejectedValueOnce(databaseDown())
    const user = renderInPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the heat map. Database unavailable')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await findHeatmap()).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(resourcesApi.list).toHaveBeenCalledTimes(2)
    expect(allocationsApi.list).toHaveBeenCalledTimes(2)
  })

  it('loads the people again with the allocations after the allocations could not be loaded', async () => {
    allocationsApi.list.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Unexpected server error' }))
    const user = renderInPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the heat map. Unexpected server error')

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await findHeatmap()).toBeInTheDocument()
    // Both lists again, so the cells and the API's totals come from the same moment.
    expect(resourcesApi.list).toHaveBeenCalledTimes(2)
    expect(allocationsApi.list).toHaveBeenCalledTimes(2)
  })

  it('keeps the grid, with a "Refreshing" bar, while the page loads the people for new filters', async () => {
    const user = renderInPage()
    await findHeatmap()
    const response = deferred()
    resourcesApi.list.mockReturnValueOnce(response.promise)
    await user.click(screen.getByRole('button', { name: 'Over-allocated only' }))
    expect(await screen.findByRole('progressbar', { name: 'Refreshing' })).toBeInTheDocument()
    expect(rowNames()).toEqual(['Maria Garcia', 'Priya Shah', 'Tom Lee'])

    await act(async () => response.resolve(list([PRIYA])))
    await waitFor(() => expect(rowNames()).toEqual(['Priya Shah']))
    expect(screen.queryByRole('progressbar', { name: 'Refreshing' })).not.toBeInTheDocument()
    expect(resourcesApi.list).toHaveBeenCalledTimes(2)
    expect(allocationsApi.list).toHaveBeenCalledTimes(1)
  })

  it("keeps the grid and shows the page's error when the people for new filters cannot be loaded", async () => {
    const user = renderInPage()
    await findHeatmap()
    resourcesApi.list.mockRejectedValueOnce(databaseDown())
    await user.click(screen.getByRole('button', { name: 'Over-allocated only' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh the heat map. Database unavailable')
    expect(screen.getByRole('table', { name: RULE })).toBeInTheDocument()

    resourcesApi.list.mockResolvedValueOnce(list([PRIYA]))
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(rowNames()).toEqual(['Priya Shah']))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(resourcesApi.list).toHaveBeenLastCalledWith({ over_allocated: true })
  })

  it("reloads the page's people with the allocations from the out-of-date warning", async () => {
    resourcesApi.list.mockResolvedValueOnce(list([MARIA, { ...PRIYA, total_allocation_percent: 60, is_over_allocated: false }, TOM]))
    const user = renderInPage()
    await findHeatmap()
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.queryByText(/The allocations changed/)).not.toBeInTheDocument())
    expect(resourcesApi.list).toHaveBeenCalledTimes(2)
    expect(allocationsApi.list).toHaveBeenCalledTimes(2)
  })

  it('shows the empty state when the page has loaded no one', async () => {
    resourcesApi.list.mockResolvedValue(list([]))
    renderInPage({ initialFilters: { search: 'zzz' } })
    expect(await screen.findByText('No matching resources')).toBeInTheDocument()
    expect(screen.getByText('No team member matches these filters. Try changing or clearing them.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
