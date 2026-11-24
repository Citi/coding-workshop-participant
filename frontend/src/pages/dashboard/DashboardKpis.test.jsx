import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { makeAuth, renderWithProviders } from '../../test/renderWithProviders'
import DashboardKpis from './DashboardKpis'
import { EMPTY_DASHBOARD, makeDashboard } from './dashboardFixtures'

/** Accessible name ("<label>: <value>, <helper>") and target of every card, in reading order (makeDashboard()). */
const CARD_LINKS = [
  ['Active projects: 3, of 5 projects', '/projects?status=active'],
  ['Projects at risk: 2, 1 at risk · 1 overdue', '/projects?health=at_risk,overdue'],
  ['Over-allocated: 2, of 15 team members', '/resources?over_allocated=true'],
  ['Budget used: 65.8%, $164,500 of $250,000', '/budget'],
  ['Key deliverables: 1 of 4, 25% completed', '/deliverables?is_key=true'],
  ['Overdue deliverables: 3, 2 blocked · 14 open', '/deliverables?overdue=true'],
]
const LABELS = ['Active projects', 'Projects at risk', 'Over-allocated', 'Budget used', 'Key deliverables', 'Overdue deliverables']

function renderKpis({ data = makeDashboard(), ...options } = {}) {
  const view = renderWithProviders(<DashboardKpis data={data} />, options)
  return { ...view, user: userEvent.setup() }
}

const region = () => screen.getByRole('region', { name: 'Key figures' })
const links = () => within(region()).queryAllByRole('link')
const tiles = () => [...region().children].map((item) => item.firstElementChild)

describe('DashboardKpis', () => {
  it('links every figure to the filtered list behind it', () => {
    renderKpis()
    expect(links().map((link) => link.getAttribute('href'))).toEqual(CARD_LINKS.map(([, href]) => href))
    CARD_LINKS.forEach(([name, href]) => expect(within(region()).getByRole('link', { name })).toHaveAttribute('href', href))
  })

  it('names each link with everything its tile shows, the words under the number included', () => {
    renderKpis()
    links().forEach((link) => {
      // Label in Name: the words on the tile, in order, are the words of the link's name.
      const words = (text) => text.replace(/[:,]/g, ' ').split(/\s+/).filter(Boolean)
      expect(words(link.getAttribute('aria-label'))).toEqual(words(link.textContent))
    })
  })

  it('names the links after the current numbers, also on an empty installation', () => {
    renderKpis({ data: EMPTY_DASHBOARD })
    expect(links().map((link) => link.getAttribute('aria-label'))).toEqual([
      'Active projects: 0, of 0 projects',
      'Projects at risk: 0, All open projects are on track',
      'Over-allocated: 0, of 0 team members',
      'Budget used: 0%, No budget planned yet',
      'Key deliverables: 0 of 0, No key deliverables yet',
      'Overdue deliverables: 0, 0 blocked · 0 open',
    ])
  })

  it('lets keyboard users tab through the figures in reading order', async () => {
    const { user } = renderKpis()
    for (const [name] of CARD_LINKS) {
      await user.tab()
      expect(screen.getByRole('link', { name })).toHaveFocus()
    }
  })

  it.each(['admin', 'manager', 'contributor', 'viewer'])('links all six figures for a %s (every role may open those lists)', (role) => {
    renderKpis({ role })
    expect(links()).toHaveLength(CARD_LINKS.length)
  })

  it('shows plain figures without links when the role may not open the other pages', async () => {
    const { user } = renderKpis({ auth: makeAuth({ permissions: ['dashboard:read'] }) })
    expect(links()).toHaveLength(0)
    expect(tiles().map((tile) => tile.querySelector('p').textContent)).toEqual(LABELS)
    expect(tiles()[1].querySelector('.MuiTypography-h4')).toHaveTextContent(/^2$/)
    await user.tab()
    expect(document.body).toHaveFocus()
  })

  it('links only the figures whose page the role may open', () => {
    renderKpis({ auth: makeAuth({ permissions: ['dashboard:read', 'projects:read', 'expenses:read'] }) })
    expect(links().map((link) => link.getAttribute('href'))).toEqual(['/projects?status=active', '/projects?health=at_risk,overdue', '/budget'])
    // The other cards are plain tiles with the same content.
    const overAllocated = tiles()[2]
    expect(within(overAllocated).queryByRole('link')).not.toBeInTheDocument()
    expect(overAllocated).toHaveTextContent('Over-allocated 2 of 15 team members')
  })

  it('keeps the layout: six equal-height tiles, two per row on phones, three on tablets and laptops, six on wide screens', () => {
    renderKpis()
    const items = [...region().children]
    expect(region().tagName).toBe('SECTION')
    expect(items).toHaveLength(6)
    items.forEach((item) => {
      expect(item).toHaveClass('MuiGrid-grid-xs-6', 'MuiGrid-grid-md-4', 'MuiGrid-grid-xl-2')
      expect(item.children).toHaveLength(1)
    })
    tiles().forEach((tile) => {
      expect(tile).toHaveClass('MuiPaper-root')
      expect(getComputedStyle(tile).height).toBe('100%')
    })
    expect(tiles().map((tile) => tile.querySelector('p').textContent)).toEqual(LABELS)
  })
})
