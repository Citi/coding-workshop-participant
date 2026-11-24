import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import DataTable from './DataTable'

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

const COLUMNS = [
  { field: 'name', header: 'Name' },
  { field: 'status', header: 'Status', render: (row) => row.status.toUpperCase() },
  { field: 'secret', header: 'Internal', hideOnMobile: true },
]
const ROWS = [
  { id: 1, name: 'Apollo', status: 'active', secret: 'x' },
  { id: 2, name: 'Zeus', status: 'planned', secret: 'y' },
]

describe('DataTable', () => {
  it('renders a table with custom cell renderers on desktop', () => {
    mobile.value = false
    renderWithProviders(<DataTable columns={COLUMNS} rows={ROWS} ariaLabel="Projects" />)
    expect(screen.getByRole('table', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('renders cards on mobile and hides mobile-hidden columns', () => {
    mobile.value = true
    renderWithProviders(<DataTable columns={COLUMNS} rows={ROWS} ariaLabel="Projects" />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText('Internal')).not.toBeInTheDocument()
    mobile.value = false
  })

  it('sets card values in the theme font like the table cells, also inside clickable cards', () => {
    mobile.value = true
    renderWithProviders(<DataTable columns={COLUMNS} rows={ROWS} onRowClick={vi.fn()} ariaLabel="Projects" />)
    const value = screen.getByText('ACTIVE')
    // A clickable card is a <button>: plain text in it would take the browser's button font.
    expect(value.closest('button')).not.toBeNull()
    expect(value).toHaveClass('MuiTypography-body2')
    expect(getComputedStyle(value).fontFamily).toContain('Inter')
    expect(getComputedStyle(value).textAlign).toBe('right')
    mobile.value = false
  })

  it('supports click and keyboard row activation', async () => {
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<DataTable columns={COLUMNS} rows={ROWS} onRowClick={onRowClick} />)
    await user.click(screen.getByText('Apollo'))
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0])
    screen.getByText('Zeus').closest('tr').focus()
    await user.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1])
  })

  it('does not trigger row clicks from the actions column', async () => {
    const onRowClick = vi.fn()
    const onEdit = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <DataTable columns={COLUMNS} rows={ROWS} onRowClick={onRowClick} renderActions={(row) => <button onClick={() => onEdit(row)}>Edit {row.name}</button>} />,
    )
    await user.click(screen.getByRole('button', { name: 'Edit Apollo' }))
    expect(onEdit).toHaveBeenCalledWith(ROWS[0])
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('shows loading, empty and error states', async () => {
    const onRetry = vi.fn()
    const { rerender } = renderWithProviders(<DataTable columns={COLUMNS} rows={[]} loading />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    rerender(<DataTable columns={COLUMNS} rows={[]} emptyTitle="No projects yet" />)
    expect(screen.getByText('No projects yet')).toBeInTheDocument()
    rerender(<DataTable columns={COLUMNS} rows={[]} error={{ message: 'Server down' }} onRetry={onRetry} />)
    expect(screen.getByText(/Server down/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load data. Server down')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
    rerender(<DataTable columns={COLUMNS} rows={ROWS} error={{ message: 'Server down' }} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh data. Server down')
  })

  it('says what failed when the page names it', () => {
    const titles = { errorTitle: 'Could not load the projects', refreshErrorTitle: 'Could not refresh the projects' }
    const { rerender } = renderWithProviders(<DataTable columns={COLUMNS} rows={[]} error={{ message: 'Server down' }} {...titles} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the projects. Server down')
    // With rows still on screen, the refresh title sits above them.
    rerender(<DataTable columns={COLUMNS} rows={ROWS} error={{ message: 'Server down' }} {...titles} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh the projects. Server down')
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})

describe('DataTable sorting', () => {
  // API order: deliberately not sorted by any column.
  const SORT_ROWS = [
    { id: 1, name: 'zeus', phase: 'Phase 10', budget: 900, due: '2026-12-01', done: true, status: 'planned' },
    { id: 2, name: 'Apollo', phase: 'Phase 2', budget: null, due: '2026-02-15', done: false, status: 'active' },
    { id: 3, name: 'hermes', phase: 'Phase 1', budget: 50, due: null, done: true, status: 'on_hold' },
    { id: 4, name: 'Atlas', phase: '', budget: 1200, due: '2026-02-01', done: false, status: 'active' },
  ]
  // Labels that sort differently from the raw values (active < on_hold < planned).
  const LABELS = { planned: 'Backlog', active: 'Running', on_hold: 'Paused' }
  const SORT_COLUMNS = [
    { field: 'name', header: 'Name', sortable: true },
    { field: 'phase', header: 'Phase', sortable: true },
    { field: 'budget', header: 'Budget', align: 'right', sortable: true },
    { field: 'due', header: 'Due', sortable: true },
    { field: 'done', header: 'Done', sortable: true, render: (row) => (row.done ? 'Yes' : 'No') },
    // Sorted by the label shown, not by the raw value.
    { field: 'status', header: 'Status', sortable: true, sortValue: (row) => LABELS[row.status], render: (row) => LABELS[row.status] },
    { field: 'notes', header: 'Notes' },
  ]

  function renderSortable(props = {}) {
    mobile.value = false
    renderWithProviders(<DataTable columns={SORT_COLUMNS} rows={SORT_ROWS} ariaLabel="Projects" {...props} />)
    return userEvent.setup()
  }

  const sortButton = (name) => screen.getByRole('button', { name })
  const header = (name) => screen.getByRole('columnheader', { name })
  /** Row names top to bottom (first column). */
  const names = () => screen.getAllByRole('row').slice(1).map((row) => row.cells[0].textContent)

  it('keeps the API order until a header is clicked, then sorts ascending, descending and back', async () => {
    const user = renderSortable()
    expect(names()).toEqual(['zeus', 'Apollo', 'hermes', 'Atlas'])

    await user.click(sortButton('Name'))
    expect(names()).toEqual(['Apollo', 'Atlas', 'hermes', 'zeus'])
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')

    await user.click(sortButton('Name'))
    expect(names()).toEqual(['zeus', 'hermes', 'Atlas', 'Apollo'])
    expect(header('Name')).toHaveAttribute('aria-sort', 'descending')

    await user.click(sortButton('Name'))
    expect(names()).toEqual(['zeus', 'Apollo', 'hermes', 'Atlas'])
    expect(header('Name')).not.toHaveAttribute('aria-sort')
  })

  it('marks only the sorted header with aria-sort and starts another column ascending', async () => {
    const user = renderSortable()
    await user.click(sortButton('Name'))
    await user.click(sortButton('Budget'))
    expect(header('Budget')).toHaveAttribute('aria-sort', 'ascending')
    const others = screen.getAllByRole('columnheader').filter((cell) => cell !== header('Budget'))
    others.forEach((cell) => expect(cell).not.toHaveAttribute('aria-sort'))
    // Columns without `sortable` have a plain header.
    expect(within(header('Notes')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('sorts numbers by size and keeps empty values last in both directions', async () => {
    const user = renderSortable()
    await user.click(sortButton('Budget'))
    expect(names()).toEqual(['hermes', 'zeus', 'Atlas', 'Apollo'])
    await user.click(sortButton('Budget'))
    expect(names()).toEqual(['Atlas', 'zeus', 'hermes', 'Apollo'])
  })

  it('reads numbers inside text as numbers, case-insensitively, with empty text last', async () => {
    const user = renderSortable()
    await user.click(sortButton('Phase'))
    expect(names()).toEqual(['hermes', 'Apollo', 'zeus', 'Atlas'])
    await user.click(sortButton('Phase'))
    expect(names()).toEqual(['zeus', 'Apollo', 'hermes', 'Atlas'])
  })

  it('sorts ISO dates by time and booleans false first, with a stable order for ties', async () => {
    const user = renderSortable()
    await user.click(sortButton('Due'))
    expect(names()).toEqual(['Atlas', 'Apollo', 'zeus', 'hermes'])

    await user.click(sortButton('Done'))
    // Ties keep the API order: Apollo before Atlas, zeus before hermes - in both directions.
    expect(names()).toEqual(['Apollo', 'Atlas', 'zeus', 'hermes'])
    await user.click(sortButton('Done'))
    expect(names()).toEqual(['zeus', 'hermes', 'Apollo', 'Atlas'])
  })

  it('sorts by sortValue when the cell shows something other than the raw value', async () => {
    const user = renderSortable()
    await user.click(sortButton('Status'))
    // Backlog, Paused, Running, Running - by the label shown, not by the raw value.
    expect(names()).toEqual(['zeus', 'hermes', 'Apollo', 'Atlas'])

    // A rank: rows without one (null) come last.
    const ranked = [{ field: 'name', header: 'Name', sortable: true, sortValue: (row) => ({ zeus: 1, hermes: 2 })[row.name] ?? null }]
    renderWithProviders(<DataTable columns={ranked} rows={SORT_ROWS} ariaLabel="Ranked" />)
    const table = screen.getByRole('table', { name: 'Ranked' })
    await user.click(within(table).getByRole('button', { name: 'Name' }))
    expect(within(table).getAllByRole('row').slice(1).map((row) => row.cells[0].textContent)).toEqual(['zeus', 'hermes', 'Apollo', 'Atlas'])
  })

  it('can be sorted from the keyboard', async () => {
    const user = renderSortable()
    await user.tab()
    expect(sortButton('Name')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')
    await user.keyboard(' ')
    expect(header('Name')).toHaveAttribute('aria-sort', 'descending')
    expect(names()).toEqual(['zeus', 'hermes', 'Atlas', 'Apollo'])
  })

  it('keeps sorting off the actions column and the row actions working', async () => {
    const onRowClick = vi.fn()
    const user = renderSortable({ onRowClick, renderActions: (row) => <button type="button">Edit {row.name}</button> })
    expect(within(header('Actions')).queryByRole('button')).not.toBeInTheDocument()
    await user.click(sortButton('Name'))
    expect(onRowClick).not.toHaveBeenCalled()
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Edit Apollo')
  })

  it('keeps every header on one line, sortable or not, the actions column included', () => {
    renderSortable({ renderActions: () => null })
    screen.getAllByRole('columnheader').forEach((cell) => expect(cell).toHaveStyle({ whiteSpace: 'nowrap' }))
  })

  it('puts the sort arrow in the cell padding beside the header, so the hidden arrow takes no room', async () => {
    const user = renderSortable()
    const arrow = (name) => sortButton(name).querySelector('.MuiTableSortLabel-icon')
    // After the text, as MUI places it; vertically the label (a flex box) keeps it centred.
    expect(sortButton('Name')).toHaveStyle({ display: 'inline-flex', alignItems: 'center' })
    expect(arrow('Name')).toHaveStyle({ position: 'absolute', left: '100%' })
    // Before the text in a right-aligned (number) column, as MUI places it there.
    expect(arrow('Budget')).toHaveStyle({ position: 'absolute', left: 'auto', right: '100%' })

    // Still part of the button, shown once sorted.
    await user.click(sortButton('Budget'))
    expect(header('Budget')).toHaveAttribute('aria-sort', 'ascending')
    expect(arrow('Budget')).toHaveStyle({ opacity: '1' })
  })

  it('keeps the API order on mobile, without sort controls', () => {
    mobile.value = true
    renderWithProviders(<DataTable columns={SORT_COLUMNS} rows={SORT_ROWS} ariaLabel="Projects" />)
    expect(screen.queryByRole('button', { name: 'Name' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((card) => card.querySelector('.MuiTypography-subtitle1').textContent)).toEqual([
      'zeus', 'Apollo', 'hermes', 'Atlas',
    ])
    mobile.value = false
  })
})
