import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { APP_NAME } from '../config'
import { renderWithProviders } from '../test/renderWithProviders'
import PageHeader from './PageHeader'

describe('PageHeader', () => {
  it('names the page in its h1 and in the browser tab, and resets the tab title when the page closes', () => {
    const { unmount } = renderWithProviders(<PageHeader title="Projects" subtitle="Every project" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByText('Every project')).toBeInTheDocument()
    expect(document.title).toBe(`Projects · ${APP_NAME}`)
    unmount()
    expect(document.title).toBe(APP_NAME)
  })

  it('shows a back link and the page actions', () => {
    renderWithProviders(
      <PageHeader title="Apollo CRM" backTo="/projects" backLabel="All projects" actions={<button type="button">Edit</button>} />,
    )
    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(document.title).toBe(`Apollo CRM · ${APP_NAME}`)
  })
})
