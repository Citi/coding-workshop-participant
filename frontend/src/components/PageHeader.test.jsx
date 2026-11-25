import Button from '@mui/material/Button'
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

  it('keeps the actions at their width beside a long subtitle, so the title and subtitle wrap instead', () => {
    renderWithProviders(
      <PageHeader
        title="Resources"
        subtitle="Team members, their workload across active projects and who is over-allocated"
        actions={
          <>
            <Button variant="outlined">Export</Button>
            <Button variant="contained">New resource</Button>
          </>
        }
      />,
    )
    const button = screen.getByRole('button', { name: 'New resource' })
    const actions = button.parentElement
    expect(actions).toContainElement(screen.getByRole('button', { name: 'Export' }))
    // The actions never shrink (at ~768px a long subtitle used to squeeze "New resource" onto two
    // lines), and a label never breaks: when the actions wrap on phones, whole buttons move.
    expect(getComputedStyle(actions).flexShrink).toBe('0')
    expect(getComputedStyle(actions).flexWrap).toBe('wrap')
    for (const action of [button, screen.getByRole('button', { name: 'Export' })]) {
      expect(getComputedStyle(action).whiteSpace).toBe('nowrap')
    }
    // The title column is the one that narrows: its text wraps beside the actions.
    const titleColumn = screen.getByRole('heading', { level: 1, name: 'Resources' }).parentElement
    expect(titleColumn).toHaveTextContent('Team members, their workload')
    expect(getComputedStyle(titleColumn).minWidth).toBe('0px')
    expect(getComputedStyle(titleColumn).flexShrink).not.toBe('0')
  })
})
