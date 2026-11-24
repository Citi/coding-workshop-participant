import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import FilterBar from './FilterBar'

describe('FilterBar', () => {
  it('limits the search to the 200 characters the API accepts (a longer one is rejected with 400)', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup({ delay: null })
    renderWithProviders(<FilterBar values={{}} onChange={onChange} />)
    const search = screen.getByRole('textbox', { name: 'Search' })

    await user.click(search)
    await user.paste('a'.repeat(250))

    expect(search).toHaveValue('a'.repeat(200))
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ search: 'a'.repeat(200) }))
  })
})
