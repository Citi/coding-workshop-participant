import { render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GridOnIcon from '@mui/icons-material/GridOn'
import ViewListIcon from '@mui/icons-material/ViewList'
import { HashRouter, MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import ViewSwitch, { useViewParam } from './ViewSwitch'

const OPTIONS = [
  { value: 'list', label: 'List', icon: <ViewListIcon /> },
  { value: 'heatmap', label: 'Heat map', icon: <GridOnIcon /> },
]

/** The address bar, the last navigation and the view the page would render (useViewParam). */
function Probes({ options, param, defaultValue }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const view = useViewParam(
    options.map((option) => option.value),
    { param, defaultValue },
  )
  return (
    <>
      <output aria-label="URL">{`${location.pathname}${location.search}`}</output>
      <output aria-label="Last navigation">{navigationType}</output>
      <output aria-label="View shown">{view}</output>
    </>
  )
}

function renderSwitch(route, props = {}) {
  const switchProps = { options: OPTIONS, ...props }
  renderWithProviders(
    <>
      <ViewSwitch {...switchProps} />
      <button type="button">Next control</button>
      <Probes {...switchProps} />
    </>,
    { route },
  )
  return userEvent.setup({ delay: null })
}

const button = (name) => screen.getByRole('button', { name })
const pressedStates = () =>
  within(screen.getByRole('group')).getAllByRole('button').map((item) => [item.textContent, item.getAttribute('aria-pressed')])
const currentUrl = () => screen.getByLabelText('URL').textContent
const lastNavigation = () => screen.getByLabelText('Last navigation').textContent
const viewShown = () => screen.getByLabelText('View shown').textContent

describe('ViewSwitch', () => {
  it('shows each view as a toggle button with its text label, the view in the URL pressed', () => {
    renderSwitch('/resources?search=crm&view=heatmap')
    const group = screen.getByRole('group', { name: 'View' })
    expect(within(group).getAllByRole('button')).toHaveLength(2)
    expect(pressedStates()).toEqual([
      ['List', 'false'],
      ['Heat map', 'true'],
    ])
    expect(viewShown()).toBe('heatmap')
    // The icons are decoration: each button is named by its label alone.
    const icon = within(button('Heat map')).getByTestId('GridOnIcon')
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('names the group with ariaLabel', () => {
    renderSwitch('/projects', { ariaLabel: 'Projects view' })
    expect(screen.getByRole('group', { name: 'Projects view' })).toBeInTheDocument()
  })

  it.each(['/resources', '/resources?view=chart', '/resources?view=', '/resources?view=HEATMAP'])(
    'shows the default view for a missing or unknown value (%s)',
    (route) => {
      renderSwitch(route)
      expect(pressedStates()).toEqual([
        ['List', 'true'],
        ['Heat map', 'false'],
      ])
      expect(viewShown()).toBe('list')
    },
  )

  it('writes the chosen view to the URL, keeping the other parameters and replacing the history entry', async () => {
    const user = renderSwitch('/resources?search=priya&over_allocated=true')
    await user.click(button('Heat map'))
    expect(currentUrl()).toBe('/resources?search=priya&over_allocated=true&view=heatmap')
    expect(lastNavigation()).toBe('REPLACE')
    expect(button('Heat map')).toHaveAttribute('aria-pressed', 'true')
    expect(button('List')).toHaveAttribute('aria-pressed', 'false')
    expect(viewShown()).toBe('heatmap')

    // The default view has no parameter.
    await user.click(button('List'))
    expect(currentUrl()).toBe('/resources?search=priya&over_allocated=true')
    expect(button('List')).toHaveAttribute('aria-pressed', 'true')
    expect(viewShown()).toBe('list')
  })

  it('replaces an unknown view in place', async () => {
    const user = renderSwitch('/resources?view=chart&department=IT')
    await user.click(button('Heat map'))
    expect(currentUrl()).toBe('/resources?view=heatmap&department=IT')
    await user.click(button('List'))
    expect(currentUrl()).toBe('/resources?department=IT')
  })

  it('keeps the pressed view when it is clicked again (the group reports null)', async () => {
    const user = renderSwitch('/resources?view=heatmap&search=crm')
    await user.click(button('Heat map'))
    expect(button('Heat map')).toHaveAttribute('aria-pressed', 'true')
    expect(currentUrl()).toBe('/resources?view=heatmap&search=crm')
    expect(lastNavigation()).toBe('POP')
  })

  it('is operable with the keyboard: Tab reaches the pressed view, arrows move, Enter and Space choose', async () => {
    const user = renderSwitch('/resources?view=heatmap&search=crm')
    await user.tab()
    expect(button('Heat map')).toHaveFocus()

    // The arrow keys only move the focus; the view changes on Enter or Space.
    await user.keyboard('{ArrowLeft}')
    expect(button('List')).toHaveFocus()
    expect(currentUrl()).toBe('/resources?view=heatmap&search=crm')
    await user.keyboard(' ')
    expect(currentUrl()).toBe('/resources?search=crm')
    expect(button('List')).toHaveAttribute('aria-pressed', 'true')
    expect(button('List')).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(button('Heat map')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(currentUrl()).toBe('/resources?search=crm&view=heatmap')
    expect(button('Heat map')).toHaveAttribute('aria-pressed', 'true')

    // The group is one tab stop, and coming back lands on the pressed view.
    await user.tab()
    expect(button('Next control')).toHaveFocus()
    await user.tab({ shift: true })
    expect(button('Heat map')).toHaveFocus()
  })

  it('works with another parameter, default view and more than two views', async () => {
    const options = [
      { value: 'board', label: 'Board' },
      { value: 'list', label: 'List' },
      { value: 'timeline', label: 'Timeline' },
    ]
    const user = renderSwitch('/projects?status=active&layout=timeline&view=heatmap', { options, param: 'layout', defaultValue: 'board' })
    expect(pressedStates()).toEqual([
      ['Board', 'false'],
      ['List', 'false'],
      ['Timeline', 'true'],
    ])
    expect(screen.queryByTestId('GridOnIcon')).not.toBeInTheDocument()

    await user.click(button('List'))
    expect(currentUrl()).toBe('/projects?status=active&layout=list&view=heatmap')
    await user.click(button('Board'))
    expect(currentUrl()).toBe('/projects?status=active&view=heatmap')
    expect(viewShown()).toBe('board')
  })
})

describe('useViewParam', () => {
  const renderView = (route, ...args) =>
    renderHook(() => useViewParam(...args), {
      wrapper: ({ children }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>,
    }).result.current

  it('returns the view in the URL when it is allowed', () => {
    expect(renderView('/projects?view=timeline&status=active', ['list', 'timeline'])).toBe('timeline')
    expect(renderView('/projects?view=list', ['list', 'timeline'])).toBe('list')
  })

  it('falls back to the default view when the parameter is missing or not allowed', () => {
    expect(renderView('/projects', ['list', 'timeline'])).toBe('list')
    expect(renderView('/projects?view=board', ['list', 'timeline'])).toBe('list')
    expect(renderView('/projects?view=timeline', ['list'])).toBe('list')
  })

  it('reads another parameter with another default', () => {
    const options = { param: 'layout', defaultValue: 'board' }
    expect(renderView('/projects?layout=timeline&view=list', ['board', 'timeline'], options)).toBe('timeline')
    expect(renderView('/projects?view=timeline', ['board', 'timeline'], options)).toBe('board')
  })
})

describe('ViewSwitch in the app router (HashRouter: #/page?query)', () => {
  afterEach(() => window.history.replaceState(null, '', window.location.pathname))

  it('keeps a filter that is already in the address bar but not rendered yet', async () => {
    window.history.replaceState(null, '', '#/resources?search=priya') // no event: the router starts here
    render(
      <HashRouter>
        <ViewSwitch options={OPTIONS} />
      </HashRouter>,
    )
    // HashRouter writes the address bar at once and re-renders in a transition; replaceState (no
    // event) reproduces a filter change that has not rendered yet when the view is switched.
    window.history.replaceState(null, '', '#/resources?search=priya&over_allocated=true')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Heat map' }))
    expect(window.location.hash).toBe('#/resources?search=priya&over_allocated=true&view=heatmap')
  })

  it('does nothing when the address bar already shows another page', async () => {
    window.history.replaceState(null, '', '#/resources')
    render(
      <HashRouter>
        <ViewSwitch options={OPTIONS} />
      </HashRouter>,
    )
    window.history.replaceState(null, '', '#/resources/5')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Heat map' }))
    expect(window.location.hash).toBe('#/resources/5')
  })
})
