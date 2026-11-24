import { screen } from '@testing-library/react'
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
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
