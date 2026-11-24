import { useState } from 'react'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import FilterBar from './FilterBar'

/** Longer than the 300 ms search debounce. */
const afterDebounce = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)))

/**
 * A page holding the filters. Like a page that keeps them in the URL, it trims the search it is
 * sent, and it can change the search from outside (a link, Back/Forward).
 */
function Page({ onChange, initial = {} }) {
  const [values, setValues] = useState(initial)
  const change = (next) => {
    onChange(next)
    setValues({ ...next, search: next.search?.trim() || undefined })
  }
  return (
    <>
      <FilterBar values={values} onChange={change} filters={[{ name: 'is_key', label: 'Key only', type: 'toggle' }]} />
      <button type="button" onClick={() => setValues({ search: 'audit' })}>Link to audit</button>
      <button type="button" onClick={() => setValues({})}>Menu link</button>
    </>
  )
}

function renderPage(initial) {
  const onChange = vi.fn()
  renderWithProviders(<Page onChange={onChange} initial={initial} />)
  return { onChange, user: userEvent.setup({ delay: null }), search: screen.getByRole('textbox', { name: 'Search' }) }
}

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

  it('shows a search changed from outside (a link, Back/Forward) without sending it back', async () => {
    const { onChange, user, search } = renderPage({ search: 'crm' })
    expect(search).toHaveValue('crm')

    await user.click(screen.getByRole('button', { name: 'Link to audit' }))
    expect(search).toHaveValue('audit')
    await user.click(screen.getByRole('button', { name: 'Menu link' }))
    expect(search).toHaveValue('')
    await afterDebounce()
    expect(onChange).not.toHaveBeenCalled()

    await user.type(search, 'x')
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ search: 'x' }))
  })

  it('keeps the text being typed when the page echoes it back trimmed', async () => {
    const { onChange, user, search } = renderPage()
    await user.type(search, 'crm ')
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ search: 'crm ' }))
    await afterDebounce()
    expect(search).toHaveValue('crm ')
    expect(search).toHaveFocus()

    await user.type(search, 'deal')
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ search: 'crm deal' }))
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  describe('with fake timers', () => {
    beforeEach(() => {
      // The clock only moves when the test says so: on a busy machine, real time between typing and
      // the outside change could pass the 300 ms debounce and send the text it is about to replace.
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('does not send text that a change from outside replaced before the debounce', async () => {
      const onChange = vi.fn()
      renderWithProviders(<Page onChange={onChange} />)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const search = screen.getByRole('textbox', { name: 'Search' })

      await user.type(search, 'abc')
      await user.click(screen.getByRole('button', { name: 'Link to audit' }))
      expect(search).toHaveValue('audit')
      act(() => vi.advanceTimersByTime(400))
      expect(onChange).not.toHaveBeenCalled()
      expect(search).toHaveValue('audit')
    })
  })

  it('keeps the search when another filter changes, and clears everything with Clear filters', async () => {
    const { onChange, user, search } = renderPage({ search: 'crm' })
    await user.click(screen.getByLabelText('Key only'))
    expect(onChange).toHaveBeenLastCalledWith({ search: 'crm', is_key: true })
    expect(search).toHaveValue('crm')

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onChange).toHaveBeenLastCalledWith({})
    expect(search).toHaveValue('')
    await afterDebounce()
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
