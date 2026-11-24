import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders'
import BudgetByProjectTable from './BudgetByProjectTable'
import { APOLLO, ATLAS, HERMES, ORION, ZEUS } from './budgetFixtures'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

function renderTable() {
  renderWithProviders(<BudgetByProjectTable projects={[APOLLO, ZEUS, HERMES, ORION, ATLAS]} />)
  return userEvent.setup({ delay: null })
}

const order = () =>
  within(screen.getByRole('table', { name: 'Planned vs consumed by project' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('link')[0].textContent)
const sortBy = (user, header) => user.click(screen.getByRole('button', { name: header }))

describe('BudgetByProjectTable sorting', () => {
  it('starts with the highest share used, and sorts it like that again (no budget but money spent counts as the most)', async () => {
    const user = renderTable()
    const byDefault = ['Hermes Payments', 'Zeus ERP', 'Orion Analytics', 'Apollo CRM']
    expect(order()).toEqual(byDefault)
    await sortBy(user, 'Used')
    expect(order()).toEqual([...byDefault].reverse())
    await sortBy(user, 'Used')
    expect(order()).toEqual(byDefault)
    expect(screen.getByRole('columnheader', { name: 'Used' })).toHaveAttribute('aria-sort', 'descending')
  })

  it('sorts money columns by amount, and status columns by their label', async () => {
    const user = renderTable()
    await sortBy(user, 'Planned')
    expect(order()).toEqual(['Hermes Payments', 'Orion Analytics', 'Zeus ERP', 'Apollo CRM'])
    await sortBy(user, 'Remaining')
    expect(order()).toEqual(['Zeus ERP', 'Hermes Payments', 'Orion Analytics', 'Apollo CRM'])
    await sortBy(user, 'Status')
    // Active (Zeus, Apollo in their earlier order), Completed, Planned
    expect(order()).toEqual(['Zeus ERP', 'Apollo CRM', 'Orion Analytics', 'Hermes Payments'])
    await sortBy(user, 'Budget status')
    await sortBy(user, 'Budget status')
    // Within budget first when descending ("Within" > "Over").
    expect(order()).toEqual(['Orion Analytics', 'Apollo CRM', 'Hermes Payments', 'Zeus ERP'])
  })
})

describe('BudgetByProjectTable layout', () => {
  it('fits a crowded table without breaking project names mid-word, with a compact bar', () => {
    renderTable()
    const row = screen.getByRole('link', { name: 'Apollo CRM' }).closest('tr')
    // overflow-wrap (unlike word-break: break-word) keeps the column as wide as the longest word.
    expect(within(row).getByRole('link', { name: 'Apollo CRM' })).toHaveStyle({ overflowWrap: 'break-word' })
    expect(within(row).getByRole('progressbar').parentElement).toHaveStyle({ minWidth: '96px' })
  })
})
