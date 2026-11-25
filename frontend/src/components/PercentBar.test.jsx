import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import PercentBar from './PercentBar'

/** The bar's box: the progress bar and its label side by side. */
const barBox = (name) => screen.getByRole('progressbar', { name }).parentElement

describe('PercentBar', () => {
  it('labels the bar with the percentage, capping only the bar at 100', () => {
    renderWithProviders(<PercentBar value={120.5} />)
    const bar = screen.getByRole('progressbar', { name: '120.5%' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText('120.5%')).toBeInTheDocument()
  })

  it('keeps 120px for the bar and its label by default (cards and lists)', () => {
    renderWithProviders(<PercentBar value={40} />)
    expect(barBox('40%')).toHaveStyle({ minWidth: '120px' })
  })

  it('needs only 96px when compact, for crowded tables', () => {
    renderWithProviders(<PercentBar value={40} compact />)
    expect(barBox('40%')).toHaveStyle({ minWidth: '96px' })
  })

  it('takes an explicit minimum width over either default', () => {
    renderWithProviders(<PercentBar value={40} label="No budget" compact minWidth={150} />)
    expect(barBox('No budget')).toHaveStyle({ minWidth: '150px' })
  })
})
