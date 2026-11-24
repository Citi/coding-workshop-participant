import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import NotFoundPage from './NotFoundPage'

describe('NotFoundPage', () => {
  it('names the page with its only h1 and links back to the dashboard', () => {
    renderWithProviders(<NotFoundPage />, { route: '/nope' })
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/')
  })
})
