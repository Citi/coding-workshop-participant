import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import DeliverablesTab from './DeliverablesTab.jsx';
import { ALPHA_DELIVERABLES, USERS } from './testFixtures.js';
import { ApiError } from '../../services/apiClient.js';
import {
  createDeliverable,
  deleteDeliverable,
  listDeliverables,
  updateDeliverable,
} from '../../services/deliverables.js';
import { listUsers } from '../../services/users.js';
import { makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';

vi.mock('../../services/deliverables.js');
vi.mock('../../services/users.js');

// Every service is mocked: fail loudly if anything still reaches the network.
const unexpectedFetch = vi.fn(() => new Promise(() => {}));
beforeAll(() => vi.stubGlobal('fetch', unexpectedFetch));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => expect(unexpectedFetch).not.toHaveBeenCalled());


const PROJECT = { id: 1, project_name: 'Project Alpha: Customer Payments Platform' };
const API_SCHEMA = ALPHA_DELIVERABLES.find((item) => item.title === 'API Schema');

function renderTab(role = 'PM', onChanged = vi.fn()) {
  const result = renderWithProviders(<DeliverablesTab project={PROJECT} onChanged={onChanged} />, {
    auth: makeAuthValue({ user: makeUser(role) }),
  });
  return { ...result, onChanged };
}

async function choose(user, combobox, option) {
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: option }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listDeliverables).mockResolvedValue({ items: ALPHA_DELIVERABLES, total: ALPHA_DELIVERABLES.length });
  vi.mocked(listUsers).mockResolvedValue({ items: USERS, total: USERS.length });
});

describe('DeliverablesTab list', () => {
  it("lists the project's deliverables with status, completion, due date, overdue flag and assignee", async () => {
    renderTab('VIEWER');

    const table = await screen.findByRole('table', { name: 'Deliverables' });
    expect(within(table).getAllByRole('row')).toHaveLength(ALPHA_DELIVERABLES.length + 1);
    const row = within(table).getByText('API Schema').closest('tr');
    expect(within(row).getByText('Blocked')).toBeInTheDocument();
    expect(row).toHaveTextContent('Blocked: Awaiting security approval of the partner data contract');
    expect(within(row).getByRole('progressbar', { name: 'API Schema completion' })).toHaveAttribute('aria-valuenow', '40');
    expect(row).toHaveTextContent('40%');
    expect(row).toHaveTextContent('Nov 19, 2026');
    expect(within(row).getByText('Overdue')).toBeInTheDocument();
    expect(row).toHaveTextContent('Priya Nair');
    const onTime = within(table).getByText('Payments Service Integration').closest('tr');
    expect(within(onTime).queryByText('Overdue')).not.toBeInTheDocument();
    expect(screen.getByText('6 deliverables · 2 overdue')).toBeInTheDocument();
    expect(listDeliverables).toHaveBeenCalledWith({ project_id: 1, limit: 25, offset: 0 }, expect.anything());
  });

  it('hides every change control from VIEWER', async () => {
    renderTab('VIEWER');
    await screen.findByRole('table', { name: 'Deliverables' });

    expect(screen.queryByRole('button', { name: 'New deliverable' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
  });

  it('lets LEAD create and edit but not delete', async () => {
    renderTab('LEAD');
    await screen.findByRole('table', { name: 'Deliverables' });

    expect(screen.getByRole('button', { name: 'New deliverable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit API Schema' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
  });

  it('shows an empty state with a create button', async () => {
    vi.mocked(listDeliverables).mockResolvedValue({ items: [], total: 0 });
    renderTab('PM');

    expect(await screen.findByText('No deliverables yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New deliverable' })).toHaveLength(2);
  });
});

describe('DeliverablesTab dialogs', () => {
  it('validates dates and completion before creating', async () => {
    const { user } = renderTab('LEAD');
    await user.click(await screen.findByRole('button', { name: 'New deliverable' }));
    const dialog = await screen.findByRole('dialog', { name: 'New deliverable' });

    await user.click(within(dialog).getByRole('button', { name: 'Create deliverable' }));
    expect(within(dialog).getByText('Enter a title.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a due date.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/^Title/), 'Load Testing');
    fireEvent.change(within(dialog).getByLabelText(/^Start date/), { target: { value: '2026-12-10' } });
    fireEvent.change(within(dialog).getByLabelText(/^Due date/), { target: { value: '2026-12-01' } });
    const completion = within(dialog).getByLabelText(/^Completion/);
    await user.clear(completion);
    await user.type(completion, '150');
    await user.click(within(dialog).getByRole('button', { name: 'Create deliverable' }));

    expect(within(dialog).getByText('The due date must be on or after the start date.')).toBeInTheDocument();
    expect(within(dialog).getByText('Completion must be a whole number from 0 to 100.')).toBeInTheDocument();
    expect(createDeliverable).not.toHaveBeenCalled();
  });

  it('creates a blocked deliverable with its reason and assignee', async () => {
    vi.mocked(createDeliverable).mockResolvedValue({ ...API_SCHEMA, id: 40, title: 'Load Testing' });
    const { user, onChanged } = renderTab('LEAD');
    await user.click(await screen.findByRole('button', { name: 'New deliverable' }));
    const dialog = await screen.findByRole('dialog', { name: 'New deliverable' });

    await user.type(within(dialog).getByLabelText(/^Title/), 'Load Testing');
    await choose(user, within(dialog).getByRole('combobox', { name: /^Status/ }), 'Blocked');
    await user.type(within(dialog).getByLabelText(/^Blocked reason/), 'Waiting for the test environment');
    await choose(user, within(dialog).getByRole('combobox', { name: 'Assignee' }), 'Arjun Mehta');
    fireEvent.change(within(dialog).getByLabelText(/^Due date/), { target: { value: '2026-12-15' } });
    await user.click(within(dialog).getByRole('button', { name: 'Create deliverable' }));

    expect(createDeliverable).toHaveBeenCalledWith({
      project_id: 1,
      title: 'Load Testing',
      status: 'BLOCKED',
      completion_percentage: 0,
      assigned_user_id: 6,
      start_date: null,
      due_date: '2026-12-15',
      blocked_reason: 'Waiting for the test environment',
      description: null,
    });
    expect(await screen.findByText('Created Load Testing.')).toBeInTheDocument();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(listDeliverables).toHaveBeenCalledTimes(2);
  });

  it('sets 100% when an edit marks the deliverable done, and sends only the changes', async () => {
    vi.mocked(updateDeliverable).mockResolvedValue({ ...API_SCHEMA, status: 'DONE', completion_percentage: 100 });
    const { user } = renderTab('PM');
    await user.click(await screen.findByRole('button', { name: 'Edit API Schema' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit API Schema' });

    expect(within(dialog).getByLabelText(/^Blocked reason/)).toHaveValue(API_SCHEMA.blocked_reason);
    await choose(user, within(dialog).getByRole('combobox', { name: /^Status/ }), 'Done');
    expect(within(dialog).getByLabelText(/^Completion/)).toHaveValue(100);
    expect(within(dialog).getByLabelText(/^Completion/)).toBeDisabled();
    expect(within(dialog).queryByLabelText(/^Blocked reason/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(updateDeliverable).toHaveBeenCalledWith(API_SCHEMA.id, {
      status: 'DONE',
      completion_percentage: 100,
      blocked_reason: null,
    });
    expect(await screen.findByText('Saved changes to API Schema.')).toBeInTheDocument();
  });

  it('shows the server field error next to the field', async () => {
    vi.mocked(createDeliverable).mockRejectedValue(
      new ApiError({
        status: 400,
        error: 'VALIDATION_ERROR',
        message: 'The due date cannot be before the start date.',
        details: [{ field: 'due_date', issue: 'Due date 2026-11-01 is before start date 2026-12-01.' }],
      }),
    );
    const { user } = renderTab('PM');
    await user.click(await screen.findByRole('button', { name: 'New deliverable' }));
    const dialog = await screen.findByRole('dialog', { name: 'New deliverable' });
    await user.type(within(dialog).getByLabelText(/^Title/), 'Load Testing');
    fireEvent.change(within(dialog).getByLabelText(/^Due date/), { target: { value: '2026-12-15' } });
    await user.click(within(dialog).getByRole('button', { name: 'Create deliverable' }));

    expect(await within(dialog).findByText('Due date 2026-11-01 is before start date 2026-12-01.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Due date/)).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByText('The deliverable was not created.')).toBeInTheDocument();
  });

  it('deletes a deliverable after confirmation (PM)', async () => {
    vi.mocked(deleteDeliverable).mockResolvedValue(null);
    const { user, onChanged } = renderTab('PM');
    await user.click(await screen.findByRole('button', { name: 'Delete API Schema' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete deliverable?' });
    expect(dialog).toHaveTextContent('API Schema and its dependency links will be permanently deleted.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete deliverable' }));

    expect(deleteDeliverable).toHaveBeenCalledWith(API_SCHEMA.id);
    expect(await screen.findByText('Deleted API Schema.')).toBeInTheDocument();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });
});
