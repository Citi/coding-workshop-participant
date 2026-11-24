import { screen, waitFor, within } from '@testing-library/react';
import DependenciesTab from './DependenciesTab.jsx';
import { ALPHA_GRAPH, ALPHA_LINKS, CYCLE_MESSAGE, CYCLE_PATH } from './testFixtures.js';
import { ApiError } from '../../services/apiClient.js';
import { createDependency, deleteDependency, listDependencies } from '../../services/dependencies.js';
import { getProjectDependencyGraph } from '../../services/projects.js';
import { PHONE_WIDTH, makeAuthValue, makeUser, renderWithProviders } from '../../test/utils.jsx';

vi.mock('../../services/projects.js');
vi.mock('../../services/dependencies.js');

// Every service is mocked: fail loudly if anything still reaches the network.
const unexpectedFetch = vi.fn(() => new Promise(() => {}));
beforeAll(() => vi.stubGlobal('fetch', unexpectedFetch));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => expect(unexpectedFetch).not.toHaveBeenCalled());


const PROJECT = { id: 1, project_name: 'Project Alpha: Customer Payments Platform' };

function renderTab(role = 'PM', { onChanged = vi.fn(), width } = {}) {
  const result = renderWithProviders(<DependenciesTab project={PROJECT} onChanged={onChanged} />, {
    auth: makeAuthValue({ user: makeUser(role) }),
    width,
  });
  return { ...result, onChanged };
}

const card = (id) => screen.getByTestId(`dependency-node-${id}`);
const predecessorSelect = () => screen.getByRole('combobox', { name: 'Predecessor (finishes first)' });
const successorSelect = () => screen.getByRole('combobox', { name: 'Successor (waits for it)' });

async function choose(user, combobox, option) {
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: option }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getProjectDependencyGraph).mockResolvedValue(ALPHA_GRAPH);
  vi.mocked(listDependencies).mockResolvedValue({ items: ALPHA_LINKS, total: ALPHA_LINKS.length });
});

describe('DependenciesTab chain (DependencyLayers)', () => {
  it('draws one column per topological level with a card per deliverable', async () => {
    renderTab('VIEWER');

    const levels = await screen.findAllByTestId('dependency-level');
    expect(levels).toHaveLength(4);
    expect(within(levels[0]).getByRole('heading', { name: 'Level 1 · 2 deliverables' })).toBeInTheDocument();
    expect(within(levels[0]).getByText('Requirements Sign-off')).toBeInTheDocument();
    expect(within(levels[0]).getByText('Data Migration Plan')).toBeInTheDocument();
    expect(within(levels[1]).getByText('API Schema')).toBeInTheDocument();
    expect(within(levels[2]).getByText('Payments Service Integration')).toBeInTheDocument();
    expect(within(levels[2]).getByText('Mobile Client Integration')).toBeInTheDocument();
    expect(within(levels[3]).getByText('End-to-End Testing')).toBeInTheDocument();
    expect(getProjectDependencyGraph).toHaveBeenCalledWith(1, {}, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(listDependencies).toHaveBeenCalledWith({ project_id: 1, limit: 200 }, expect.anything());
  });

  it('labels root causes and impacted items in text as well as colour, and lists predecessors', async () => {
    renderTab('VIEWER');
    await screen.findAllByTestId('dependency-level');

    [2, 6].forEach((id) => {
      const chip = within(card(id)).getByText('Root cause').closest('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorError');
    });
    [3, 4, 5].forEach((id) => {
      const chip = within(card(id)).getByText('Impacted').closest('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorWarning');
      expect(within(card(id)).queryByText('Root cause')).not.toBeInTheDocument();
    });
    expect(within(card(1)).queryByText('Root cause')).not.toBeInTheDocument();
    expect(within(card(1)).queryByText('Impacted')).not.toBeInTheDocument();
    expect(screen.getByText('Root cause (2)')).toBeInTheDocument();
    expect(screen.getByText('Impacted (3)')).toBeInTheDocument();
    expect(card(5)).toHaveTextContent('Depends on: Payments Service Integration');
    expect(card(5)).toHaveTextContent('Held up by API Schema (2 steps downstream)');
    expect(card(2)).toHaveTextContent('Depends on: Requirements Sign-off');
  });

  it('lists every dependency link that touches the project', async () => {
    renderTab('VIEWER');

    const links = await screen.findByRole('region', { name: 'Dependency links' });
    expect(within(links).getAllByRole('listitem')).toHaveLength(4);
    expect(within(links).getByText('Requirements Sign-off → API Schema')).toBeInTheDocument();
    expect(within(links).getByText('4 links touch this project')).toBeInTheDocument();
  });

  it('stacks the levels on a phone', async () => {
    renderTab('PM', { width: PHONE_WIDTH });

    const levels = await screen.findAllByTestId('dependency-level');
    expect(levels[0].parentElement).toHaveStyle({ flexDirection: 'column' });
  });
});

describe('DependenciesTab add-dependency form', () => {
  it('shows a cycle rejection live with the full path from the API message', async () => {
    vi.mocked(createDependency).mockRejectedValue(
      new ApiError({
        status: 400,
        error: 'DEPENDENCY_CYCLE',
        message: CYCLE_MESSAGE,
        details: [{ field: 'successor_deliverable_id', issue: CYCLE_PATH }],
      }),
    );
    const { user, onChanged } = renderTab('PM');
    await screen.findAllByTestId('dependency-level');

    await choose(user, predecessorSelect(), 'End-to-End Testing');
    await choose(user, successorSelect(), 'API Schema');
    await user.click(screen.getByRole('button', { name: 'Add dependency' }));

    expect(createDependency).toHaveBeenCalledWith({ predecessor_deliverable_id: 5, successor_deliverable_id: 2 });
    const alert = await screen.findByTestId('dependency-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Cycle detected: dependency not added');
    expect(alert).toHaveTextContent(`This dependency would create a cycle: ${CYCLE_PATH}`);
    expect(successorSelect()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('This pair would close a loop.')).toBeInTheDocument();
    expect(await screen.findByText('Dependency rejected: it would create a cycle.')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();

    // Picking another pair clears the rejection.
    await choose(user, predecessorSelect(), 'Requirements Sign-off');
    expect(screen.queryByTestId('dependency-error')).not.toBeInTheDocument();
  });

  it('checks the selection before calling the API', async () => {
    const { user } = renderTab('LEAD');
    await screen.findAllByTestId('dependency-level');

    await user.click(screen.getByRole('button', { name: 'Add dependency' }));
    expect(screen.getByText('Choose the deliverable that must finish first.')).toBeInTheDocument();
    expect(screen.getByText('Choose the deliverable that waits for it.')).toBeInTheDocument();
    expect(predecessorSelect()).toHaveFocus();

    await choose(user, predecessorSelect(), 'API Schema');
    await choose(user, successorSelect(), 'API Schema');
    await user.click(screen.getByRole('button', { name: 'Add dependency' }));
    expect(screen.getByText('A deliverable cannot depend on itself.')).toBeInTheDocument();
    expect(createDependency).not.toHaveBeenCalled();
  });

  it('adds a dependency, confirms it and refreshes the chain and the project', async () => {
    vi.mocked(createDependency).mockResolvedValue({
      id: 99,
      predecessor_deliverable_id: 6,
      predecessor_title: 'Data Migration Plan',
      predecessor_project_id: 1,
      successor_deliverable_id: 5,
      successor_title: 'End-to-End Testing',
      successor_project_id: 1,
      created_at: '2026-11-24T10:00:00Z',
    });
    const { user, onChanged } = renderTab('LEAD');
    await screen.findAllByTestId('dependency-level');

    await choose(user, predecessorSelect(), 'Data Migration Plan');
    await choose(user, successorSelect(), 'End-to-End Testing');
    await user.click(screen.getByRole('button', { name: 'Add dependency' }));

    expect(
      await screen.findByText('Added: End-to-End Testing now depends on Data Migration Plan.'),
    ).toBeInTheDocument();
    expect(createDependency).toHaveBeenCalledWith({ predecessor_deliverable_id: 6, successor_deliverable_id: 5 });
    await waitFor(() => expect(getProjectDependencyGraph).toHaveBeenCalledTimes(2));
    expect(listDependencies).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(predecessorSelect()).not.toHaveTextContent('Data Migration Plan');
    expect(successorSelect()).not.toHaveTextContent('End-to-End Testing');
  });
});

describe('DependenciesTab permissions', () => {
  it('shows VIEWER the chain and links but no add or remove controls', async () => {
    renderTab('VIEWER');
    await screen.findAllByTestId('dependency-level');
    await screen.findByText('Requirements Sign-off → API Schema');

    expect(screen.queryByRole('button', { name: 'Add dependency' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove dependency/ })).not.toBeInTheDocument();
  });

  it('lets LEAD add dependencies but not remove them', async () => {
    renderTab('LEAD');
    await screen.findByText('Requirements Sign-off → API Schema');

    expect(screen.getByRole('button', { name: 'Add dependency' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove dependency/ })).not.toBeInTheDocument();
  });

  it('lets PM remove a dependency after confirming', async () => {
    vi.mocked(deleteDependency).mockResolvedValue(null);
    const { user, onChanged } = renderTab('PM');
    await screen.findByText('Requirements Sign-off → API Schema');

    await user.click(screen.getByRole('button', { name: 'Remove dependency Requirements Sign-off → API Schema' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove dependency?' });
    expect(dialog).toHaveTextContent('API Schema will no longer wait for Requirements Sign-off.');
    expect(deleteDependency).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(deleteDependency).toHaveBeenCalledWith(1);
    expect(
      await screen.findByText('Removed: API Schema no longer depends on Requirements Sign-off.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('keeps the link when the removal is cancelled', async () => {
    const { user } = renderTab('ADMIN');
    await screen.findByText('Requirements Sign-off → API Schema');

    await user.click(screen.getByRole('button', { name: 'Remove dependency API Schema → Mobile Client Integration' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove dependency?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(deleteDependency).not.toHaveBeenCalled();
  });
});
