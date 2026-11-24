import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import DataTable from './DataTable'

// Window width seen by react-responsive (used by useIsMobile and by DataTable itself).
const viewport = vi.hoisted(() => ({ width: 1280 }))
vi.mock('react-responsive', () => ({ useMediaQuery: ({ maxWidth }) => viewport.width <= maxWidth }))

const COLUMNS = [
  { field: 'name', header: 'Name' },
  { field: 'email', header: 'Email', hideOnMobile: true },
  { field: 'department', header: 'Department' },
]
const ROWS = [{ id: 1, name: 'Priya Shah', email: 'priya@acme.com', department: 'IT' }]
const actions = (row) => <button type="button">Edit {row.name}</button>

function renderAt(width, props = {}) {
  viewport.width = width
  return renderWithProviders(<DataTable columns={COLUMNS} rows={ROWS} renderActions={actions} ariaLabel="People" {...props} />)
}

const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent)

describe('DataTable across screen widths', () => {
  it('shows every column on a wide screen', () => {
    renderAt(1280)
    expect(headers()).toEqual(['Name', 'Email', 'Department', 'Actions'])
  })

  it('leaves out secondary columns below 1200px, where the side menu leaves little room for the table', () => {
    renderAt(1024)
    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument()
    expect(headers()).toEqual(['Name', 'Department', 'Actions'])
    expect(screen.queryByText('priya@acme.com')).not.toBeInTheDocument()
  })

  it('keeps the actions column in view when a wide table scrolls sideways', () => {
    renderAt(1280)
    const cell = screen.getByRole('button', { name: 'Edit Priya Shah' }).closest('td')
    expect(getComputedStyle(cell).position).toBe('sticky')
    expect(getComputedStyle(screen.getByRole('columnheader', { name: 'Actions' })).position).toBe('sticky')
  })

  it('still shows cards on phones', () => {
    renderAt(375)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Priya Shah')
    expect(screen.queryByText('priya@acme.com')).not.toBeInTheDocument()
  })
})
