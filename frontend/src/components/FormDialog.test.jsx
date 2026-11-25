import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../services/apiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import { notBefore } from '../utils/validators'
import FormDialog from './FormDialog'

const FIELDS = [
  { name: 'name', label: 'Name', required: true, maxLength: 150 },
  { name: 'budget', label: 'Budget', type: 'number', min: 0 },
  { name: 'start_date', label: 'Start date', type: 'date', required: true },
  { name: 'end_date', label: 'End date', type: 'date', required: true, validate: notBefore('start_date', 'the start date') },
  { name: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'active', label: 'Active' }] },
  { name: 'is_key', label: 'Key deliverable', type: 'checkbox' },
]

function setup(props = {}) {
  const onSubmit = props.onSubmit || vi.fn().mockResolvedValue()
  const onClose = vi.fn()
  renderWithProviders(
    <FormDialog open title="New project" fields={FIELDS} initialValues={{ status: 'active', ...props.initialValues }} onSubmit={onSubmit} onClose={onClose} />,
  )
  return { onSubmit, onClose, user: userEvent.setup() }
}

describe('FormDialog', () => {
  it('marks required fields and blocks submission until they are valid', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Please fix the highlighted fields.')).toBeInTheDocument()
    expect(screen.getAllByText('This field is required')).toHaveLength(3)
  })

  it('runs custom cross-field validation', async () => {
    const { onSubmit, user } = setup({ initialValues: { name: 'Apollo', start_date: '2026-05-10', end_date: '2026-05-01' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Must be on or after the start date')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits a typed payload', async () => {
    const { onSubmit, user } = setup({ initialValues: { start_date: '2026-01-01', end_date: '2026-02-01' } })
    await user.type(screen.getByLabelText(/Name/), 'Apollo')
    await user.type(screen.getByLabelText('Budget'), '1500.5')
    await user.click(screen.getByLabelText('Key deliverable'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Apollo', budget: 1500.5, start_date: '2026-01-01', end_date: '2026-02-01', status: 'active', is_key: true,
    })
  })

  it('shows server-side field errors and keeps the dialog usable', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({ status: 409, code: 'CONFLICT', message: 'A project with this name already exists', details: { name: 'Already exists' } }),
    )
    const { user } = setup({ onSubmit, initialValues: { name: 'Apollo', start_date: '2026-01-01', end_date: '2026-02-01' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('A project with this name already exists')).toBeInTheDocument()
    expect(screen.getByText('Already exists')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('disables the form while saving', async () => {
    let resolve
    const onSubmit = vi.fn(() => new Promise((done) => { resolve = done }))
    const { user } = setup({ onSubmit, initialValues: { name: 'Apollo', start_date: '2026-01-01', end_date: '2026-02-01' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled()
    expect(screen.getByLabelText(/Name/)).toBeDisabled()
    resolve()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })

  it('cancel calls onClose', async () => {
    const { onClose, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders renderAfterFields under the fields with the values entered so far', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <FormDialog
        open
        title="New project"
        fields={FIELDS}
        initialValues={{ status: 'active' }}
        onSubmit={vi.fn().mockResolvedValue()}
        onClose={vi.fn()}
        renderAfterFields={(values) => <p data-testid="preview">{`Name: ${values.name}`}</p>}
      />,
    )
    expect(screen.getByTestId('preview').textContent).toBe('Name: ')
    await user.type(screen.getByLabelText(/Name/), 'Apollo')
    expect(screen.getByTestId('preview')).toHaveTextContent('Name: Apollo')
    // inside the form, after the fields
    expect(screen.getByTestId('preview').closest('form')).toContainElement(screen.getByLabelText(/Name/))
  })

  it('renders nothing extra without renderAfterFields', () => {
    setup()
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
  })
})
