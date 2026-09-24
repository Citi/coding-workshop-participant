import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { ApiError } from '../services/apiClient'
import { listBuildings, listFloors, listSeats } from '../services/locationService'
import { createTicket, getMyTicket } from '../services/ticketService'
import { makeTicket } from '../test/fixtures'
import { JANE, renderWithProviders } from '../test/renderWithProviders'

vi.mock('../services/locationService', () => ({
  listBuildings: vi.fn(),
  listFloors: vi.fn(),
  listSeats: vi.fn(),
}))
vi.mock('../services/ticketService', () => ({
  createTicket: vi.fn(),
  listMyTickets: vi.fn().mockResolvedValue([]),
  getMyTicket: vi.fn(),
  listNotes: vi.fn().mockResolvedValue([]),
  listStatusHistory: vi.fn().mockResolvedValue([]),
  addNote: vi.fn(),
}))

const BUILDINGS = [
  { building_id: 1, building_name: 'Building A' },
  { building_id: 2, building_name: 'Building B' },
  { building_id: 3, building_name: 'Annex' },
]
const FLOORS = {
  1: [{ floor_id: 1, floor_number: 1, building_id: 1 }, { floor_id: 3, floor_number: 3, building_id: 1 }],
  2: [{ floor_id: 4, floor_number: 1, building_id: 2 }],
  3: [],
}
const SEATS = {
  1: [{ seat_id: 1, seat_number: '101', floor_id: 1 }],
  3: [{ seat_id: 3, seat_number: '301', floor_id: 3 }, { seat_id: 8, seat_number: '302', floor_id: 3 }],
  4: [{ seat_id: 4, seat_number: '101', floor_id: 4 }],
}

// Required labels end in " *", so match on how the name starts.
const combo = (label) => screen.getByRole('combobox', { name: new RegExp(`^${label}`) })
const field = (label) => screen.getByRole('textbox', { name: new RegExp(`^${label}`) })

async function choose(user, label, option) {
  await user.click(combo(label))
  await user.click(await screen.findByRole('option', { name: option }))
}

async function fillWhatsWrong(user) {
  await user.type(field('Title'), 'Printer jam')
  await user.click(screen.getByRole('radio', { name: 'Printer / Peripheral' }))
  await user.type(field('Full description'), 'Every job jams in tray 2.')
}

async function chooseSeat301(user) {
  await user.click(screen.getByRole('radio', { name: /^Just me/ }))
  await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
  await choose(user, 'Building', 'Building A')
  await waitFor(() => expect(combo('Floor')).not.toHaveAttribute('aria-disabled'))
  await choose(user, 'Floor', 'Floor 3')
  await waitFor(() => expect(combo('Seat')).not.toHaveAttribute('aria-disabled'))
  await choose(user, 'Seat', 'Seat 301')
}

function renderPage() {
  const user = userEvent.setup()
  renderWithProviders(<App />, { route: '/tickets/new', user: JANE })
  return user
}

beforeEach(() => {
  vi.mocked(listBuildings).mockReset().mockResolvedValue(BUILDINGS)
  vi.mocked(listFloors).mockReset().mockImplementation(({ buildingId }) => Promise.resolve(FLOORS[buildingId]))
  vi.mocked(listSeats).mockReset().mockImplementation(({ floorId }) => Promise.resolve(SEATS[floorId]))
  vi.mocked(createTicket).mockReset()
})

describe('CreateTicketPage: layout', () => {
  it('is reached from the dashboard and needs sign-in', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/dashboard', user: JANE })
    // The page's own button, not the sidebar link of the same name.
    await screen.findByRole('heading', { name: "You haven't reported any issues yet" })
    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Report an issue' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Report an issue' })).toBeInTheDocument()
  })

  it('shows the three sections, required fields and a way back', async () => {
    renderPage()
    for (const name of ["What's wrong", 'Who is affected?', 'Where']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(field('Title')).toBeRequired()
    expect(field('Full description')).toBeRequired()
    expect(screen.queryByRole('group', { name: /^Urgency/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /^Short description/ })).not.toBeInTheDocument()
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(breadcrumb).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(within(breadcrumb).getByText('Report an issue')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('group', { name: /^Who is affected\?/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /^Category/ })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/priority|\bP[123]\b/i)
    await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
  })

  it('counts characters in the text fields', async () => {
    const user = renderPage()
    expect(screen.getByText('0/150')).toBeInTheDocument()
    await user.type(field('Title'), '  Printer  ')
    expect(screen.getByText('7/150')).toBeInTheDocument()
  })
})

describe('CreateTicketPage: Building -> Floor -> Seat', () => {
  it('keeps floor and seat disabled until the level above is chosen', async () => {
    renderPage()
    expect(screen.getByText('Choose a building first.')).toBeInTheDocument()
    expect(screen.getByText('Choose a floor first.')).toBeInTheDocument()
    expect(combo('Floor')).toHaveAttribute('aria-disabled', 'true')
    expect(combo('Seat')).toHaveAttribute('aria-disabled', 'true')
    expect(listFloors).not.toHaveBeenCalled()
    await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
  })

  it('loads floors for the building and seats for the floor', async () => {
    const user = renderPage()

    await chooseSeat301(user)

    expect(listFloors).toHaveBeenCalledWith({ buildingId: '1' }, expect.anything())
    expect(listSeats).toHaveBeenCalledWith({ floorId: '3' }, expect.anything())
    expect(combo('Seat')).toHaveTextContent('Seat 301')
  })

  it('clears floor and seat when the building changes', async () => {
    const user = renderPage()
    await chooseSeat301(user)

    await choose(user, 'Building', 'Building B')

    await waitFor(() => expect(combo('Floor')).not.toHaveAttribute('aria-disabled'))
    expect(combo('Floor')).not.toHaveTextContent('Floor 3')
    expect(combo('Seat')).toHaveAttribute('aria-disabled', 'true')
    await user.click(combo('Floor'))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Floor 1'])
  })

  it('says when a building has no floors', async () => {
    const user = renderPage()
    await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
    await choose(user, 'Building', 'Annex')
    await waitFor(() => expect(combo('Floor')).not.toHaveAttribute('aria-disabled'))

    await user.click(combo('Floor'))

    expect(screen.getByRole('option', { name: 'No floors here' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('marks floor and seat required only when the scope needs them', async () => {
    const user = renderPage()
    // MUI labels a select with <label id="<id>-label"> and adds " *" when required.
    const isMarkedRequired = (name) =>
      document.getElementById(`ticket-${name}-label`).textContent.includes('*')

    expect(isMarkedRequired('building_id')).toBe(true)
    expect(isMarkedRequired('floor_id')).toBe(false)
    await user.click(screen.getByRole('radio', { name: /^My floor/ }))
    expect(isMarkedRequired('floor_id')).toBe(true)
    expect(isMarkedRequired('seat_id')).toBe(false)
    await user.click(screen.getByRole('radio', { name: /^Just me/ }))
    expect(isMarkedRequired('seat_id')).toBe(true)
    await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
  })

  it('explains a failed location load and retries', async () => {
    vi.mocked(listBuildings)
      .mockRejectedValueOnce(new ApiError("Can't reach the server. Check your connection and try again.", { status: 0 }))
    const user = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load locations. Can't reach the server.")
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('CreateTicketPage: submitting', () => {
  it('blocks an empty form, explains each field and focuses the title', async () => {
    const user = renderPage()

    await user.click(screen.getByRole('button', { name: 'Submit ticket' }))

    expect(createTicket).not.toHaveBeenCalled()
    for (const message of [
      'Give the issue a short title.',
      'Choose a category.',
      "Describe what's happening.",
      "Choose who's affected.",
      'Choose a building.',
    ]) {
      expect(screen.getByText(message)).toBeInTheDocument()
    }
    expect(field('Title')).toHaveFocus()
  })

  it('focuses the first missing choice when the text is filled in', async () => {
    const user = renderPage()
    await user.type(field('Title'), 'Printer jam')
      await user.click(screen.getByRole('radio', { name: 'Printer / Peripheral' }))
    await user.type(field('Full description'), 'Every job jams.')

    await user.click(screen.getByRole('button', { name: 'Submit ticket' }))

    expect(screen.getByRole('radio', { name: /^Just me/ })).toHaveFocus()
  })

  it('checks a text field when the user leaves it, but not one they only tabbed through', async () => {
    const user = renderPage()
    await user.click(field('Title'))
    await user.tab()
    expect(screen.queryByText('Give the issue a short title.')).not.toBeInTheDocument()

    await user.type(field('Title'), '   ')
    await user.tab()
    expect(screen.getByText('Give the issue a short title.')).toBeInTheDocument()
  })

  it('requires a seat for "Just me", and drops that once the scope is widened', async () => {
    const user = renderPage()
    await fillWhatsWrong(user)
    await user.click(screen.getByRole('radio', { name: /^Just me/ }))
    await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
    await choose(user, 'Building', 'Building A')

    await user.click(screen.getByRole('button', { name: 'Submit ticket' }))
    expect(screen.getByText('Choose your seat.')).toBeInTheDocument()
    expect(combo('Floor')).toHaveFocus()

    await user.click(screen.getByRole('radio', { name: /^Whole building/ }))
    expect(screen.queryByText('Choose your seat.')).not.toBeInTheDocument()
    expect(screen.queryByText('Choose a floor.')).not.toBeInTheDocument()
  })

  it('creates the ticket and opens it with a confirmation', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ticket_id: 12, title: 'Printer jam' })
    vi.mocked(getMyTicket).mockResolvedValue(
      makeTicket({ ticket_id: 12, title: 'Printer jam', description: 'Every job jams in tray 2.', assigned_to_name: null }),
    )
    const user = renderPage()
    await fillWhatsWrong(user)
    await chooseSeat301(user)

    await user.click(screen.getByRole('button', { name: 'Submit ticket' }))

    expect(createTicket).toHaveBeenCalledWith({
      title: 'Printer jam',
      description: 'Every job jams in tray 2.',
      category: 'printer',
      affected_scope: 'me',
      building_id: '1',
      floor_id: '3',
      seat_id: '3',
    })
    expect(await screen.findByRole('heading', { level: 1, name: '#12 Printer jam' })).toBeInTheDocument()
    expect(getMyTicket).toHaveBeenCalledWith({ ticketId: '12' }, expect.anything())
    expect(screen.getByRole('alert')).toHaveTextContent('Ticket created.')
  })

  it('disables the form while sending', async () => {
    vi.mocked(createTicket).mockReturnValue(new Promise(() => {}))
    const user = renderPage()
    await fillWhatsWrong(user)
    await chooseSeat301(user)

    await user.click(screen.getByRole('button', { name: 'Submit ticket' }))

    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
    expect(field('Title')).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^Just me/ })).toBeDisabled()
  })

  it('shows an API location mismatch at the top of the form', async () => {
    vi.mocked(createTicket).mockRejectedValue(new ApiError('Seat 3 is not on floor 3', { status: 400 }))
    const user = renderPage()
    await fillWhatsWrong(user)
    await chooseSeat301(user)

    await user.click(screen.getByRole('button', { name: 'Submit ticket' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Seat 3 is not on floor 3')
    expect(screen.getByRole('button', { name: 'Submit ticket' })).toBeEnabled()
  })

  it('puts API validation messages on their fields', async () => {
    vi.mocked(createTicket).mockRejectedValue(
      new ApiError('Please fix the highlighted fields.', {
        status: 422,
        fieldErrors: { title: 'String should have at most 150 characters' },
      }),
    )
    const user = renderPage()
    await fillWhatsWrong(user)
    await chooseSeat301(user)

    await user.click(screen.getByRole('button', { name: 'Submit ticket' }))

    expect(await screen.findByText('String should have at most 150 characters')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Please fix the highlighted fields.')
  })

  it('never shows raw JavaScript errors', async () => {
    vi.mocked(createTicket).mockRejectedValue(new TypeError('x is undefined'))
    const user = renderPage()
    await fillWhatsWrong(user)
    await chooseSeat301(user)

    await user.click(screen.getByRole('button', { name: 'Submit ticket' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  })
})

describe('CreateTicketPage: summary and guidance', () => {
  const summary = () => screen.getByRole('complementary', { name: 'Summary' })
  const summaryRows = () =>
    within(summary()).getAllByRole('term').map((dt) => [dt.textContent, dt.nextSibling.textContent])

  it('starts with nothing chosen and fills in as the user picks', async () => {
    const user = renderPage()
    expect(summaryRows()).toEqual([
      ['Category', 'Not chosen yet'],
      ['Location', 'Not chosen yet'],
      ['Affects', 'Not chosen yet'],
    ])

    await fillWhatsWrong(user)
    await chooseSeat301(user)

    expect(summaryRows()).toEqual([
      ['Category', 'Printer / Peripheral'],
      ['Location', 'Building A · Floor 3 · Seat 301'],
      ['Affects', 'Just me'],
    ])
    expect(summary()).toHaveTextContent('A Facility Admin reviews your ticket and assigns an engineer.')
    expect(summary()).not.toHaveTextContent(/priority|\bP[123]\b/i)
  })

  it('marks the chosen tile', async () => {
    const user = renderPage()
    const tile = screen.getByRole('radio', { name: 'Printer / Peripheral' })
    expect(tile).not.toBeChecked()
    await user.click(tile)
    expect(tile).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Network / Internet' })).not.toBeChecked()
    await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
  })

  it('says which location levels to pick for who is affected', async () => {
    const user = renderPage()
    expect(screen.getByText('Pick only the levels that apply.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /^Just me/ }))
    expect(screen.getByText('Just you: pick your building, floor and seat.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /^My floor/ }))
    expect(screen.getByText('Your floor: pick the building and floor.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /^Whole building/ }))
    expect(screen.getByText('The whole building: pick the building.')).toBeInTheDocument()
    await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
  })

  it('announces a missing choice on its group', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Submit ticket' }))
    const category = screen.getByRole('group', { name: /^Category/ })
    expect(category).toHaveAttribute('aria-invalid', 'true')
    expect(category).toHaveAccessibleDescription('Choose a category.')
  })

  it('puts the summary beside the form on desktop', async () => {
    renderWithProviders(<App />, { route: '/tickets/new', user: JANE, width: 1280 })
    const form = screen.getByRole('button', { name: 'Submit ticket' }).closest('form')
    expect(form).not.toContainElement(summary())
    await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
  })

  it.each([820, 375])('puts the summary above the buttons at %ipx', async (width) => {
    renderWithProviders(<App />, { route: '/tickets/new', user: JANE, width })
    const form = screen.getByRole('button', { name: 'Submit ticket' }).closest('form')
    expect(form).toContainElement(summary())
    await waitFor(() => expect(combo('Building')).not.toHaveAttribute('aria-disabled'))
  })
})

