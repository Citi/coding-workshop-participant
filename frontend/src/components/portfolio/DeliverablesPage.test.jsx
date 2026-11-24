import { screen, waitFor, within } from '@testing-library/react';
import { Link, useLocation } from 'react-router-dom';
import DeliverablesPage from '../../pages/DeliverablesPage.jsx';
import { ApiError } from '../../services/apiClient.js';
import { deleteDeliverable, listDeliverables, updateDeliverable } from '../../services/deliverables.js';
import { listProjects } from '../../services/projects.js';
import { listUsers } from '../../services/users.js';
import { makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';
import { DELIVERABLES, PROJECTS, USERS } from './testFixtures.js';

vi.mock('../../services/deliverables.js', () => ({
  listDeliverables: vi.fn(),
  createDeliverable: vi.fn(),
  updateDeliverable: vi.fn(),
  deleteDeliverable: vi.fn(),
}));
vi.mock('../../services/projects.js', () => ({ listProjects: vi.fn() }));
vi.mock('../../services/users.js', () => ({ listUsers: vi.fn() }));

const EMPTY = { items: [], total: 0 };

function renderPage(role = 'PM', route = '/deliverables') {
  return renderWithProviders(<DeliverablesPage />, { route, auth: makeAuthValue({ user: makeUser(role) }) });
}

/** The params object of the most recent listDeliverables call. */
function lastParams() {
  return listDeliverables.mock.calls.at(-1)[0];
}

/** Prints the router's current query string, so tests can check what a link would carry. */
function LocationSearch() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

/** Takes no props. */
LocationSearch.propTypes = {};

/**
 * Type the way a fast typist does: every keystroke changes the box and fires `input` at once,
 * outside act(). act() would flush all pending work after each key, including the router's
 * low-priority (transition) URL updates, and so hide keystrokes that a real browser drops.
 * @param {HTMLInputElement} input - The text box.
 * @param {string} text - Characters to type, one event each.
 */
function typeWithoutAct(input, text) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const actEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    for (const character of text) {
      setValue.call(input, input.value + character);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
  }
}

beforeEach(() => {
  listDeliverables.mockResolvedValue(DELIVERABLES);
  listProjects.mockResolvedValue(PROJECTS);
  listUsers.mockResolvedValue(USERS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DeliverablesPage filters', () => {
  it('loads the first page without filters, then sends each chosen filter to the API', async () => {
    const { user } = renderPage();

    expect(await screen.findByText('API Schema')).toBeInTheDocument();
    expect(lastParams()).toEqual({ limit: 25, offset: 0 });
    expect(listDeliverables.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Blocked' }));
    await waitFor(() => expect(lastParams()).toEqual({ status: 'BLOCKED', limit: 25, offset: 0 }));

    await user.click(screen.getByRole('checkbox', { name: 'Overdue only' }));
    await waitFor(() => expect(lastParams()).toEqual({ status: 'BLOCKED', overdue: true, limit: 25, offset: 0 }));

    await user.click(screen.getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: 'Project Alpha: Customer Payments Platform' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ project_id: 1, status: 'BLOCKED', overdue: true }));

    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(await screen.findByRole('option', { name: 'Priya Nair' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ assigned_user_id: 5, project_id: 1 }));

    await user.type(screen.getByRole('searchbox', { name: 'Search deliverables' }), '  api ');
    await waitFor(() => expect(lastParams()).toMatchObject({ q: 'api', assigned_user_id: 5 }));
  });

  it('keeps every character typed at full speed, then puts the settled search in the URL', async () => {
    const { user } = renderWithProviders(
      <>
        <DeliverablesPage />
        <LocationSearch />
      </>,
      { route: '/deliverables?status=BLOCKED', auth: makeAuthValue({ user: makeUser('PM') }) },
    );
    await screen.findByText('API Schema');
    const box = screen.getByRole('searchbox', { name: 'Search deliverables' });

    typeWithoutAct(box, 'Payments Service');
    expect(box).toHaveValue('Payments Service');

    await waitFor(() => expect(lastParams()).toEqual({ q: 'Payments Service', status: 'BLOCKED', limit: 25, offset: 0 }));
    await waitFor(() =>
      expect(screen.getByTestId('location-search')).toHaveTextContent('?status=BLOCKED&q=Payments+Service'),
    );
    expect(box).toHaveValue('Payments Service');

    // Emptying the box takes the search out of the URL again.
    await user.clear(box);
    await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent(/^\?status=BLOCKED$/));
    await waitFor(() => expect(lastParams()).toEqual({ status: 'BLOCKED', limit: 25, offset: 0 }));
  });

  it('shows a search that arrives through a link while the page is open', async () => {
    const { user } = renderWithProviders(
      <>
        <Link to="/deliverables?q=brand">Brand deliverables</Link>
        <DeliverablesPage />
      </>,
      { route: '/deliverables', auth: makeAuthValue({ user: makeUser('PM') }) },
    );
    await screen.findByText('API Schema');
    const box = screen.getByRole('searchbox', { name: 'Search deliverables' });
    await user.type(box, 'api');
    await waitFor(() => expect(lastParams()).toMatchObject({ q: 'api' }));

    await user.click(screen.getByRole('link', { name: 'Brand deliverables' }));
    await waitFor(() => expect(box).toHaveValue('brand'));
    await waitFor(() => expect(lastParams()).toEqual({ q: 'brand', limit: 25, offset: 0 }));
  });

  it('reads filters from the query string and ignores values the API would reject', async () => {
    renderPage('VIEWER', '/deliverables?status=DONE&overdue=true&project_id=2&assigned_user_id=abc&q=brand');

    await screen.findByText('Brand Guidelines');
    expect(listDeliverables).toHaveBeenCalledTimes(1);
    expect(lastParams()).toEqual({ q: 'brand', status: 'DONE', overdue: true, project_id: 2, limit: 25, offset: 0 });
  });

  it('goes back to the first page when a filter changes', async () => {
    listDeliverables.mockResolvedValue({ ...DELIVERABLES, total: 60 });
    const { user } = renderPage();
    await screen.findByText('API Schema');

    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ offset: 25 }));

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Done' }));
    await waitFor(() => expect(lastParams()).toEqual({ status: 'DONE', limit: 25, offset: 0 }));
  });
});

describe('DeliverablesPage states', () => {
  it('shows the rows with status, overdue and completion as text', async () => {
    renderPage();

    const table = await screen.findByRole('table', { name: 'Deliverables' });
    const row = within(table).getByText('API Schema').closest('tr');
    expect(within(row).getByText('Blocked')).toBeInTheDocument();
    expect(within(row).getByText('Overdue')).toBeInTheDocument();
    expect(within(row).getByText('40%')).toBeInTheDocument();
    expect(within(row).getByText(/Awaiting security approval/)).toBeInTheDocument();
    const projectLink = within(row).getByRole('link', { name: 'Project Alpha' });
    expect(projectLink).toHaveAttribute('href', '/projects/1?tab=deliverables');
    expect(projectLink).toHaveAttribute('title', 'Project Alpha: Customer Payments Platform');
    expect(within(table).getByText('Unassigned')).toBeInTheDocument();
  });

  it('shows an empty state, and offers to clear filters when filtered', async () => {
    listDeliverables.mockResolvedValue(EMPTY);
    const { user } = renderPage('PM', '/deliverables?status=BLOCKED&q=zzz');

    expect(await screen.findByText('No deliverables match these filters')).toBeInTheDocument();
    const box = screen.getByRole('searchbox', { name: 'Search deliverables' });
    expect(box).toHaveValue('zzz');
    const clearButtons = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(clearButtons[clearButtons.length - 1]);

    await waitFor(() => expect(lastParams()).toEqual({ limit: 25, offset: 0 }));
    expect(await screen.findByText('No deliverables yet')).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('shows the error with a retry that loads the list again', async () => {
    listDeliverables.mockRejectedValueOnce(
      new ApiError({ status: 500, error: 'INTERNAL_ERROR', message: 'The server had a problem. Please try again.' }),
    );
    const { user } = renderPage();

    expect(await screen.findByText('Could not load this data')).toBeInTheDocument();
    expect(screen.getByText('The server had a problem. Please try again.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('API Schema')).toBeInTheDocument();
    expect(listDeliverables).toHaveBeenCalledTimes(2);
  });
});

describe('DeliverablesPage actions by role', () => {
  it.each([
    ['ADMIN', true, true, true],
    ['PM', true, true, true],
    ['LEAD', true, true, false],
    ['VIEWER', false, false, false],
  ])('%s: create %s, edit %s, delete %s', async (role, canCreate, canEdit, canDelete) => {
    renderPage(role);
    await screen.findByText('API Schema');

    expect(Boolean(screen.queryByRole('button', { name: 'New deliverable' }))).toBe(canCreate);
    expect(Boolean(screen.queryByRole('button', { name: 'Edit API Schema' }))).toBe(canEdit);
    expect(Boolean(screen.queryByRole('button', { name: 'Delete API Schema' }))).toBe(canDelete);
  });

  it('edits in a dialog: choosing Done sends 100% and clears the blocked reason', async () => {
    updateDeliverable.mockResolvedValue({ ...DELIVERABLES.items[0], status: 'DONE' });
    const { user } = renderPage('LEAD');
    await user.click(await screen.findByRole('button', { name: 'Edit API Schema' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit deliverable' });
    expect(within(dialog).getByLabelText(/Blocked reason/)).toHaveValue(
      'Awaiting security approval of the partner data contract',
    );
    await user.click(within(dialog).getByRole('combobox', { name: /^Status/ }));
    await user.click(screen.getByRole('option', { name: 'Done' }));
    expect(within(dialog).getByLabelText(/Completion/)).toHaveValue(100);
    expect(within(dialog).getByLabelText(/Completion/)).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateDeliverable).toHaveBeenCalledTimes(1));
    expect(updateDeliverable).toHaveBeenCalledWith(2, {
      title: 'API Schema',
      description: null,
      assigned_user_id: 5,
      start_date: null,
      due_date: '2026-11-19',
      status: 'DONE',
      completion_percentage: 100,
      blocked_reason: null,
    });
    expect(await screen.findByText('Saved “API Schema”.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit deliverable' })).not.toBeInTheDocument());
    expect(listDeliverables).toHaveBeenCalledTimes(2);
  });

  it('checks the form before saving and shows server field errors', async () => {
    updateDeliverable.mockRejectedValue(
      new ApiError({
        status: 400,
        error: 'VALIDATION_ERROR',
        message: 'The request is not valid.',
        details: [{ field: 'due_date', issue: 'The due date must not be before the start date.' }],
      }),
    );
    const { user } = renderPage('PM');
    await user.click(await screen.findByRole('button', { name: 'Edit API Schema' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit deliverable' });

    await user.clear(within(dialog).getByLabelText(/^Title/));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(within(dialog).getByText('Enter a title.')).toBeInTheDocument();
    expect(updateDeliverable).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/^Title/), 'API Schema v2');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText('The due date must not be before the start date.')).toBeInTheDocument();
    expect(within(dialog).getByText('The request is not valid.')).toBeInTheDocument();
    // The failure also reaches the app-wide snackbar (spec 12.4).
    await waitFor(() => expect(screen.getAllByText('The request is not valid.')).toHaveLength(2));
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('asks for confirmation before deleting', async () => {
    deleteDeliverable.mockResolvedValue(null);
    const { user } = renderPage('PM');
    await user.click(await screen.findByRole('button', { name: 'Delete API Schema' }));

    const confirm = screen.getByRole('dialog', { name: 'Delete deliverable?' });
    expect(confirm).toHaveTextContent('“API Schema” and its dependency links will be removed.');
    expect(deleteDeliverable).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteDeliverable).toHaveBeenCalledWith(2));
    expect(await screen.findByText('Deleted “API Schema”.')).toBeInTheDocument();
  });

  it('reports a failed delete in the snackbar', async () => {
    deleteDeliverable.mockRejectedValue(new ApiError({ status: 403, error: 'ACCESS_DENIED', message: 'Role not allowed.' }));
    const { user } = renderPage('PM');
    await user.click(await screen.findByRole('button', { name: 'Delete API Schema' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete deliverable?' })).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Role not allowed.')).toBeInTheDocument();
  });
});
