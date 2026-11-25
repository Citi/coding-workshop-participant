import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import StatCard from './StatCard'

const ERROR_RED = 'rgb(185, 28, 28)'
const PRIMARY_BLUE = 'rgb(29, 78, 216)'

const RISK = {
  label: 'Projects at risk',
  value: 2,
  helper: '1 at risk · 1 overdue',
  color: 'error.main',
  icon: <WarningAmberIcon color="error" />,
}
const TARGET = '/projects?health=at_risk,overdue'
const RISK_NAME = 'Projects at risk: 2, 1 at risk · 1 overdue'

/** Shows where a link took the user (path + query of the current route). */
function CurrentLocation() {
  const { pathname, search } = useLocation()
  return <p data-testid="location">{`${pathname}${search}`}</p>
}

/** A tile on "/" with the page it links to registered, so following the link can be checked. */
function renderTile(props) {
  const view = renderWithProviders(<StatCard {...props} />, {
    route: '/',
    path: '/',
    extraRoutes: [{ path: '/projects', element: <CurrentLocation /> }],
  })
  return { ...view, user: userEvent.setup() }
}

const tileOf = (label) => screen.getByText(label).closest('.MuiPaper-root')

describe('StatCard', () => {
  describe('without a link', () => {
    it('shows the label and icon, the value and the helper line in a plain tile', () => {
      renderTile(RISK)
      const tile = tileOf('Projects at risk')
      expect([...tile.children].map((child) => child.tagName)).toEqual(['DIV', 'P', 'P'])
      const [header, value, helper] = tile.children
      expect(header).toHaveTextContent('Projects at risk')
      expect(header.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(value).toHaveClass('MuiTypography-h4')
      expect(value).toHaveTextContent(/^2$/)
      expect(getComputedStyle(value).color).toBe(ERROR_RED)
      expect(helper).toHaveTextContent('1 at risk · 1 overdue')
      expect(getComputedStyle(tile).padding).toBe('16px')
    })

    it('has no link cue (chevron) and no room kept for one: it does not open anything', () => {
      renderTile(RISK)
      expect(screen.queryByTestId('ChevronRightIcon')).not.toBeInTheDocument()
      expect(screen.getByText('1 at risk · 1 overdue')).not.toHaveStyle({ paddingRight: '24px' })
    })

    it('is not interactive: no link, no button, nothing to tab to', async () => {
      const { container, user } = renderTile(RISK)
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(container.querySelector('[tabindex], [id], [aria-label]')).toBeNull()
      await user.tab()
      expect(document.body).toHaveFocus()
    })

    it('leaves out the helper line when there is none', () => {
      renderTile({ label: 'Active projects', value: 3 })
      expect(tileOf('Active projects').children).toHaveLength(2)
    })
  })

  describe('with a link', () => {
    it('makes the whole tile one link named by what it shows: label, value and helper', () => {
      renderTile({ ...RISK, to: TARGET })
      const link = screen.getByRole('link', { name: RISK_NAME })
      expect(screen.getAllByRole('link')).toHaveLength(1)
      expect(link).toHaveAttribute('href', TARGET)
      expect(link.parentElement).toBe(tileOf('Projects at risk'))
      expect(link).toHaveTextContent('Projects at risk 2 1 at risk · 1 overdue')
      // The helper is part of the name, so it is not repeated as a description.
      expect(link).not.toHaveAttribute('aria-describedby')
      expect(link).toHaveAccessibleDescription('')
    })

    it('has every word shown in the link in its name, in the same order (WCAG 2.5.3 Label in Name)', () => {
      renderTile({ ...RISK, to: TARGET })
      const link = screen.getByRole('link', { name: RISK_NAME })
      // axe's "label-content-name-mismatch" joins the link's text nodes as they are (no space between
      // blocks) and compares its words with the name's, punctuation aside.
      const words = (text) => text.replace(/[:,]/g, ' ').split(/\s+/).filter(Boolean)
      expect(words(link.textContent)).toEqual(['Projects', 'at', 'risk', '2', '1', 'at', 'risk', '·', '1', 'overdue'])
      expect(words(link.getAttribute('aria-label'))).toEqual(words(link.textContent))
      expect(link.getAttribute('aria-label')).toMatch(/^Projects at risk: 2/) // "click Projects at risk" works by voice
    })

    it('keeps the words of a plain tile apart too, without changing its layout', () => {
      renderTile(RISK)
      const tile = tileOf('Projects at risk')
      expect(tile.textContent).toBe('Projects at risk 2 1 at risk · 1 overdue')
      expect([...tile.children].map((child) => child.tagName)).toEqual(['DIV', 'P', 'P'])
    })

    it('keeps the layout and colours of the plain tile', () => {
      renderTile({ ...RISK, to: TARGET })
      const tile = tileOf('Projects at risk')
      const link = screen.getByRole('link')
      // The padding moves onto the link so the whole tile is clickable; the content sits where it did.
      expect(getComputedStyle(tile).padding).toBe('0px')
      expect(getComputedStyle(link).padding).toBe('16px')
      // Label row, value and helper line as in the plain tile; then the chevron and MUI's focus highlight.
      expect([...link.children].map((child) => child.tagName)).toEqual(['DIV', 'P', 'P', 'svg', 'SPAN'])
      const value = link.querySelector('.MuiTypography-h4')
      expect(value).toHaveTextContent(/^2$/)
      expect(getComputedStyle(value).color).toBe(ERROR_RED)
      expect(getComputedStyle(link).textDecorationLine).toBe('none')
      expect(getComputedStyle(link).cursor).toBe('pointer')
      expect(getComputedStyle(tile).height).toBe('100%')
      expect(getComputedStyle(link).height).toBe('100%')
    })

    it('can be reached with the keyboard, shows a focus ring and opens its page with Enter', async () => {
      const { user } = renderTile({ ...RISK, to: TARGET })
      const link = screen.getByRole('link', { name: RISK_NAME })
      expect(getComputedStyle(link).outlineStyle).not.toBe('solid')

      await user.tab()
      expect(link).toHaveFocus()
      const ring = getComputedStyle(link)
      expect(ring.outlineStyle).toBe('solid')
      expect(ring.outlineWidth).toBe('2px')
      expect(ring.outlineColor).toBe(PRIMARY_BLUE)

      await user.keyboard('{Enter}')
      expect(await screen.findByTestId('location')).toHaveTextContent(TARGET)
    })

    it('opens its page when clicked anywhere on the tile', async () => {
      const { user } = renderTile({ ...RISK, to: TARGET })
      await user.click(screen.getByText('1 at risk · 1 overdue'))
      expect(await screen.findByTestId('location')).toHaveTextContent(TARGET)
    })

    it('names text values too, and is named by label and value alone without a helper line', () => {
      renderTile({ label: 'Key deliverables', value: '1 of 4', to: '/projects' })
      expect(screen.getByRole('link', { name: 'Key deliverables: 1 of 4' })).toHaveAccessibleDescription('')
    })

    it('shows that it opens something without hover too (touch screens): a chevron in its corner', () => {
      renderTile({ ...RISK, to: TARGET })
      const link = screen.getByRole('link', { name: RISK_NAME })
      const chevron = within(link).getByTestId('ChevronRightIcon')
      // Decorative: screen readers already hear a link, and the name stays what the tile shows.
      expect(chevron).toHaveAttribute('aria-hidden', 'true')
      expect(link).toHaveAccessibleName(RISK_NAME)
      expect(link).toHaveTextContent(/^Projects at risk 2 1 at risk · 1 overdue$/)
      // In the bottom-right corner of the content (the link has 16px padding and is positioned), so
      // it lines up across a row of tiles; the last line wraps before it.
      expect(getComputedStyle(link).position).toBe('relative')
      expect(chevron).toHaveStyle({ position: 'absolute', right: '16px', bottom: '16px' })
      expect(screen.getByText('1 at risk · 1 overdue')).toHaveStyle({ paddingRight: '24px' })
      expect(link.querySelector('.MuiTypography-h4')).not.toHaveStyle({ paddingRight: '24px' })
    })

    it('keeps the value clear of the chevron when it is the last line (no helper)', () => {
      renderTile({ label: 'Key deliverables', value: '1 of 4', to: '/projects' })
      const link = screen.getByRole('link', { name: 'Key deliverables: 1 of 4' })
      expect(within(link).getByTestId('ChevronRightIcon')).toBeInTheDocument()
      expect(link.querySelector('.MuiTypography-h4')).toHaveStyle({ paddingRight: '24px' })
    })
  })
})
