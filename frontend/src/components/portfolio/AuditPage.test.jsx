import { screen, waitFor, within } from '@testing-library/react';
import AuditPage from '../../pages/AuditPage.jsx';
import { listAuditLogs } from '../../services/auditLogs.js';
import { listUsers } from '../../services/users.js';
import { PHONE_WIDTH, makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';
import { AUDIT_LOGS, USERS } from './testFixtures.js';

vi.mock('../../services/auditLogs.js', () => ({ listAuditLogs: vi.fn() }));
vi.mock('../../services/users.js', () => ({ listUsers: vi.fn() }));

/** A deleted budget entry, as `to_state` records it (money as a decimal string). */
const BUDGET_DELETE = {
  id: 13,
  actor_id: 2,
  actor_email: 'pm@acme.example',
  entity_type: 'budget_entry',
  entity_id: 17,
  action: 'DELETE',
  before_state: {
    id: 17,
    project_id: 4,
    category: 'HARDWARE',
    description: 'Handheld scanners, batch 2 of 3',
    amount: '110000.00',
    entry_date: '2026-10-20',
    created_at: '2026-11-24T17:26:22Z',
  },
  after_state: null,
  created_at: '2026-11-24T18:20:00Z',
};

function renderPage(options = {}) {
  return renderWithProviders(<AuditPage />, { route: '/audit', auth: makeAuthValue({ user: makeUser('PM') }), ...options });
}

function lastParams() {
  return listAuditLogs.mock.calls.at(-1)[0];
}

beforeEach(() => {
  listAuditLogs.mockResolvedValue(AUDIT_LOGS);
  listUsers.mockResolvedValue(USERS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuditPage', () => {
  it('lists entries newest first with action, record, actor and a summary', async () => {
    renderPage();

    const table = await screen.findByRole('table', { name: 'Audit log entries' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Updated');
    expect(rows[1]).toHaveTextContent('Deliverable #2');
    expect(rows[1]).toHaveTextContent('API Schema');
    expect(rows[1]).toHaveTextContent('pm@acme.example');
    expect(rows[1]).toHaveTextContent('Changed status and completion percentage');
    expect(rows[3]).toHaveTextContent('Created');
    expect(rows[3]).toHaveTextContent('Department #9');
    expect(rows[3]).toHaveTextContent('Legal');
    expect(rows[3]).toHaveTextContent('Created this record');
    expect(lastParams()).toEqual({ limit: 25, offset: 0 });
  });

  it('opens an entry to compare values before and after, marking what changed', async () => {
    const { user } = renderPage();
    const toggle = await screen.findByRole('button', { name: /^Show values before and after: Deliverable #2, update/ });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const diff = await screen.findByRole('table', { name: 'Values before and after the change' });
    expect(within(diff).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Field', 'Before', 'After']);
    const status = within(diff).getByText('Status').closest('tr');
    expect(within(status).getByText('Changed')).toBeInTheDocument();
    expect(status).toHaveTextContent('BLOCKED');
    expect(status).toHaveTextContent('IN_PROGRESS');
    const title = within(diff).getByText('Title').closest('tr');
    expect(within(title).queryByText('Changed')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Show values before and after: Department #9, create/ }));
    const created = await screen.findByRole('table', { name: 'Values when the record was created' });
    expect(within(created).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Field', 'Value']);
    expect(created).toHaveTextContent('Legal');
  });

  it('filters by record type, record id and person', async () => {
    const { user } = renderPage();
    await screen.findByRole('table', { name: 'Audit log entries' });

    await user.click(screen.getByRole('combobox', { name: 'Record type' }));
    await user.click(screen.getByRole('option', { name: 'Deliverable' }));
    await waitFor(() => expect(lastParams()).toEqual({ entity_type: 'deliverable', limit: 25, offset: 0 }));

    await user.type(screen.getByLabelText('Record id'), '2');
    await waitFor(() => expect(lastParams()).toEqual({ entity_type: 'deliverable', entity_id: 2, limit: 25, offset: 0 }));

    await user.click(screen.getByRole('combobox', { name: 'Changed by' }));
    await user.click(await screen.findByRole('option', { name: 'Vikram Shah' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ entity_id: 2, actor_id: 2 }));

    const calls = listAuditLogs.mock.calls.length;
    await user.type(screen.getByLabelText('Record id'), 'x');
    expect(await screen.findByText('Enter a whole number.')).toBeInTheDocument();
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    expect(listAuditLogs).toHaveBeenCalledTimes(calls);

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(lastParams()).toEqual({ limit: 25, offset: 0 }));
  });

  it('shows money in the platform currency, in the list and in the removed values', async () => {
    listAuditLogs.mockResolvedValue({ items: [BUDGET_DELETE], total: 1 });
    const { user } = renderPage();

    const table = await screen.findByRole('table', { name: 'Audit log entries' });
    expect(table).toHaveTextContent('Hardware $110,000.00');
    expect(table).not.toHaveTextContent('110000.00');

    await user.click(screen.getByRole('button', { name: /^Show values before and after: Budget entry #17, delete/ }));
    const removed = await screen.findByRole('table', { name: 'Values when the record was deleted' });
    expect(within(removed).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Field', 'Value']);
    expect(within(removed).getByText('Amount').closest('tr')).toHaveTextContent('$110,000.00');
    expect(within(removed).getByText('Entry date').closest('tr')).toHaveTextContent('2026-10-20');
  });

  it('names the phone details button after its visible text', async () => {
    const { user } = renderPage({ width: PHONE_WIDTH });

    const list = await screen.findByRole('list', { name: 'Audit log entries' });
    const toggle = within(list).getByRole('button', { name: /^Show details: values before and after: Deliverable #2, update/ });
    await user.click(toggle);
    expect(toggle).toHaveAccessibleName(/^Hide details: values before and after: Deliverable #2, update/);
    expect(await screen.findByRole('table', { name: 'Values before and after the change' })).toBeInTheDocument();
  });

  it('explains an empty log', async () => {
    listAuditLogs.mockResolvedValue({ items: [], total: 0 });
    renderPage();

    expect(await screen.findByText('No changes recorded yet')).toBeInTheDocument();
  });
});
