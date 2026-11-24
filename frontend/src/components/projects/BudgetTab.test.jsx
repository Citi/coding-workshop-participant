import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import BudgetTab from './BudgetTab.jsx';
import { ALPHA, ALPHA_BUDGET_ENTRIES, PROJECTS } from './testFixtures.js';
import {
  createBudgetEntry,
  deleteBudgetEntry,
  listBudgetEntries,
  updateBudgetEntry,
} from '../../services/budgetEntries.js';
import { makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';

vi.mock('../../services/budgetEntries.js');

// Every service is mocked: fail loudly if anything still reaches the network.
const unexpectedFetch = vi.fn(() => new Promise(() => {}));
beforeAll(() => vi.stubGlobal('fetch', unexpectedFetch));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => expect(unexpectedFetch).not.toHaveBeenCalled());


const LABOR = ALPHA_BUDGET_ENTRIES.find((entry) => entry.category === 'LABOR');

function renderTab(role = 'PM', project = ALPHA, onChanged = vi.fn()) {
  const result = renderWithProviders(<BudgetTab project={project} onChanged={onChanged} />, {
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
  vi.mocked(listBudgetEntries).mockResolvedValue({ items: ALPHA_BUDGET_ENTRIES, total: ALPHA_BUDGET_ENTRIES.length });
});

describe('BudgetTab', () => {
  it('shows planned, spent, remaining and utilization with the entries and their total', async () => {
    renderTab('VIEWER');

    const totals = screen.getByRole('region', { name: 'Budget totals' });
    expect(totals).toHaveTextContent('Planned$400,000.00');
    expect(totals).toHaveTextContent('Spent$300,000.00');
    expect(totals).toHaveTextContent('Remaining$100,000.00');
    expect(totals).toHaveTextContent('Budget used75.0%');
    const table = await screen.findByRole('table', { name: 'Budget entries' });
    expect(within(table).getAllByRole('row')).toHaveLength(ALPHA_BUDGET_ENTRIES.length + 1);
    const row = within(table).getByText('Engineering contractors').closest('tr');
    expect(row).toHaveTextContent('Nov 4, 2026');
    expect(row).toHaveTextContent('Labor');
    expect(row).toHaveTextContent('$180,000.00');
    expect(screen.getByText(/Total of 5 entries:/)).toHaveTextContent(
      'Total of 5 entries: $300,000.00 of $400,000.00 planned (75.0%)',
    );
    expect(listBudgetEntries).toHaveBeenCalledWith({ project_id: 1, limit: 25, offset: 0 }, expect.anything());
  });

  it('flags spend above the plan', async () => {
    renderTab('VIEWER', PROJECTS.find((project) => project.id === 4));

    const totals = screen.getByRole('region', { name: 'Budget totals' });
    expect(totals).toHaveTextContent('-$10,000.00');
    expect(totals).toHaveTextContent('Over the planned budget');
    expect(totals).toHaveTextContent('105.0%');
    await screen.findByRole('table', { name: 'Budget entries' });
  });

  it.each(['LEAD', 'VIEWER'])('keeps %s to reading', async (role) => {
    renderTab(role);
    await screen.findByRole('table', { name: 'Budget entries' });

    expect(screen.queryByRole('button', { name: 'Record spend' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
  });

  it('validates the amount and records spend for PM', async () => {
    vi.mocked(createBudgetEntry).mockResolvedValue({ ...LABOR, id: 50, amount: '1500.50' });
    const { user, onChanged } = renderTab('PM');
    await user.click(await screen.findByRole('button', { name: 'Record spend' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record spend' });

    await user.click(within(dialog).getByRole('button', { name: 'Record spend' }));
    expect(within(dialog).getByText('Choose a category.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Enter the amount/)).toBeInTheDocument();
    expect(within(dialog).getByText('Choose the date of the spend.')).toBeInTheDocument();

    await choose(user, within(dialog).getByRole('combobox', { name: /^Category/ }), 'Software');
    await user.type(within(dialog).getByLabelText(/^Amount/), '0');
    fireEvent.change(within(dialog).getByLabelText(/^Date/), { target: { value: '2026-11-20' } });
    await user.click(within(dialog).getByRole('button', { name: 'Record spend' }));
    expect(within(dialog).getByText('Amount must be greater than 0.')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText(/^Amount/));
    await user.type(within(dialog).getByLabelText(/^Amount/), '1,500.5');
    await user.type(within(dialog).getByLabelText(/^Description/), 'Load testing licences');
    await user.click(within(dialog).getByRole('button', { name: 'Record spend' }));

    expect(createBudgetEntry).toHaveBeenCalledWith({
      project_id: 1,
      category: 'SOFTWARE',
      amount: '1500.50',
      entry_date: '2026-11-20',
      description: 'Load testing licences',
    });
    expect(await screen.findByText('Spend recorded.')).toBeInTheDocument();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('edits an entry sending only the changed amount', async () => {
    vi.mocked(updateBudgetEntry).mockResolvedValue({ ...LABOR, amount: '175000.00' });
    const { user } = renderTab('ADMIN');
    await user.click(await screen.findByRole('button', { name: 'Edit Labor entry of Nov 4, 2026' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit budget entry' });

    const amount = within(dialog).getByLabelText(/^Amount/);
    expect(amount).toHaveValue('180000.00');
    await user.clear(amount);
    await user.type(amount, '175000');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(updateBudgetEntry).toHaveBeenCalledWith(LABOR.id, { amount: '175000.00' });
    expect(await screen.findByText('Budget entry updated.')).toBeInTheDocument();
  });

  it('deletes an entry after confirmation', async () => {
    vi.mocked(deleteBudgetEntry).mockResolvedValue(null);
    const { user, onChanged } = renderTab('PM');
    await user.click(await screen.findByRole('button', { name: 'Delete Labor entry of Nov 4, 2026' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete budget entry?' });
    expect(dialog).toHaveTextContent('The Labor entry of $180,000.00 on Nov 4, 2026 will be permanently deleted');
    await user.click(within(dialog).getByRole('button', { name: 'Delete entry' }));

    expect(deleteBudgetEntry).toHaveBeenCalledWith(LABOR.id);
    expect(await screen.findByText('Budget entry deleted.')).toBeInTheDocument();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });
});
