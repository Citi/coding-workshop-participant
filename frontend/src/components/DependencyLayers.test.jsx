import { screen, within } from '@testing-library/react';
import DependencyLayers from './DependencyLayers.jsx';
import { PHONE_WIDTH, renderWithProviders } from '../test/utils.jsx';

// Project Alpha from the seed (spec section 10), as GET /projects/{id}/dependency-graph returns it.
const ALPHA_GRAPH = {
  project_id: 1,
  nodes: [
    { id: 1, title: 'Requirements Sign-off', project_id: 1, status: 'DONE', completion_percentage: 100, due_date: '2026-10-25', assigned_user_name: 'Vikram Shah', level: 0, is_root_cause: false, is_impacted: false, is_external: false, predecessor_ids: [] },
    { id: 2, title: 'API Schema', project_id: 1, status: 'BLOCKED', completion_percentage: 40, due_date: '2026-11-19', assigned_user_name: 'Priya Nair', level: 1, is_root_cause: true, is_impacted: false, is_external: false, predecessor_ids: [1] },
    { id: 3, title: 'Payments Service Integration', project_id: 1, status: 'IN_PROGRESS', completion_percentage: 20, due_date: '2026-12-04', assigned_user_name: 'Arjun Mehta', level: 2, is_root_cause: false, is_impacted: true, is_external: false, predecessor_ids: [2] },
    { id: 4, title: 'Mobile Client Integration', project_id: 1, status: 'NOT_STARTED', completion_percentage: 0, due_date: '2026-12-08', assigned_user_name: 'Rohan Das', level: 2, is_root_cause: false, is_impacted: true, is_external: false, predecessor_ids: [2] },
    { id: 5, title: 'End-to-End Testing', project_id: 1, status: 'NOT_STARTED', completion_percentage: 0, due_date: '2026-12-16', assigned_user_name: 'Rohan Das', level: 3, is_root_cause: false, is_impacted: true, is_external: false, predecessor_ids: [3] },
    { id: 6, title: 'Data Migration Plan', project_id: 1, status: 'IN_PROGRESS', completion_percentage: 50, due_date: '2026-11-21', assigned_user_name: 'Rohan Das', level: 0, is_root_cause: true, is_impacted: false, is_external: false, predecessor_ids: [] },
  ],
  edges: [
    { id: 1, predecessor_deliverable_id: 1, successor_deliverable_id: 2 },
    { id: 2, predecessor_deliverable_id: 2, successor_deliverable_id: 3 },
    { id: 3, predecessor_deliverable_id: 2, successor_deliverable_id: 4 },
    { id: 4, predecessor_deliverable_id: 3, successor_deliverable_id: 5 },
  ],
  levels: [[1, 6], [2], [3, 4], [5]],
  roots: [2, 6],
  impacted: [
    { id: 3, title: 'Payments Service Integration', depth: 1, caused_by: 'API Schema' },
    { id: 4, title: 'Mobile Client Integration', depth: 1, caused_by: 'API Schema' },
    { id: 5, title: 'End-to-End Testing', depth: 2, caused_by: 'API Schema' },
  ],
};

const card = (id) => screen.getByTestId(`dependency-node-${id}`);

describe('DependencyLayers', () => {
  it('draws one column per topological level with a card per deliverable', () => {
    renderWithProviders(<DependencyLayers graph={ALPHA_GRAPH} />);

    const levels = screen.getAllByTestId('dependency-level');
    expect(levels).toHaveLength(4);
    expect(within(levels[0]).getByRole('heading', { name: 'Level 1 · 2 deliverables' })).toBeInTheDocument();
    expect(within(levels[0]).getByText('Requirements Sign-off')).toBeInTheDocument();
    expect(within(levels[0]).getByText('Data Migration Plan')).toBeInTheDocument();
    expect(within(levels[1]).getByText('API Schema')).toBeInTheDocument();
    expect(within(levels[2]).getAllByRole('listitem')).toHaveLength(2);
    expect(within(levels[3]).getByRole('heading', { name: 'Level 4 · 1 deliverable' })).toBeInTheDocument();
    expect(within(levels[3]).getByText('End-to-End Testing')).toBeInTheDocument();
  });

  it('labels root causes and impacted items with text, not just colour', () => {
    renderWithProviders(<DependencyLayers graph={ALPHA_GRAPH} />);

    expect(within(card(2)).getByText('Root cause')).toBeInTheDocument();
    expect(within(card(6)).getByText('Root cause')).toBeInTheDocument();
    [3, 4, 5].forEach((id) => {
      expect(within(card(id)).getByText('Impacted')).toBeInTheDocument();
      expect(within(card(id)).queryByText('Root cause')).not.toBeInTheDocument();
    });
    expect(within(card(1)).queryByText('Impacted')).not.toBeInTheDocument();
    expect(within(card(1)).queryByText('Root cause')).not.toBeInTheDocument();
    expect(screen.getByText('Root cause (2)')).toBeInTheDocument();
    expect(screen.getByText('Impacted (3)')).toBeInTheDocument();
    expect(within(card(2)).getByText('Blocked')).toBeInTheDocument();
  });

  it('colours root causes with the error colour and impacted items with the warning colour', () => {
    renderWithProviders(<DependencyLayers graph={ALPHA_GRAPH} />);

    expect(within(card(2)).getByText('Root cause').closest('.MuiChip-root')).toHaveClass('MuiChip-colorError');
    expect(within(card(3)).getByText('Impacted').closest('.MuiChip-root')).toHaveClass('MuiChip-colorWarning');
  });

  it('lists the predecessors on each card and what holds impacted items up', () => {
    renderWithProviders(<DependencyLayers graph={ALPHA_GRAPH} />);

    expect(card(1)).toHaveTextContent('Depends on: nothing');
    expect(card(2)).toHaveTextContent('Depends on: Requirements Sign-off');
    expect(card(5)).toHaveTextContent('Depends on: Payments Service Integration');
    expect(card(5)).toHaveTextContent('Held up by API Schema (2 steps downstream)');
    expect(card(3)).toHaveTextContent('Held up by API Schema (1 step downstream)');
    expect(card(2)).toHaveTextContent('40% complete · due Nov 19, 2026 · owner Priya Nair');
  });

  it('falls back to node levels and edges when levels and predecessor ids are missing', () => {
    const graph = {
      nodes: [
        { id: 10, title: 'Upstream', status: 'DONE', completion_percentage: 100, level: 0 },
        { id: 11, title: 'Downstream', status: 'IN_PROGRESS', completion_percentage: 10, level: 1 },
        { id: 12, title: 'Partner Feed', status: 'BLOCKED', completion_percentage: 0, level: 0, is_external: true, is_root_cause: true },
      ],
      edges: [
        { id: 1, predecessor_deliverable_id: 10, successor_deliverable_id: 11 },
        { id: 2, predecessor_deliverable_id: 12, successor_deliverable_id: 11 },
      ],
    };
    renderWithProviders(<DependencyLayers graph={graph} />);

    expect(screen.getAllByTestId('dependency-level')).toHaveLength(2);
    expect(card(11)).toHaveTextContent('Depends on: Upstream, Partner Feed');
    expect(within(card(12)).getByText('Other project')).toBeInTheDocument();
  });

  it('shows an empty state when there are no deliverables', () => {
    renderWithProviders(<DependencyLayers graph={{ nodes: [], edges: [], levels: [] }} />);

    expect(screen.getByText('No deliverables yet')).toBeInTheDocument();
  });

  it('stacks the levels vertically on a phone', () => {
    renderWithProviders(<DependencyLayers graph={ALPHA_GRAPH} />, { width: PHONE_WIDTH });

    const container = screen.getAllByTestId('dependency-level')[0].parentElement;
    expect(container).toHaveStyle({ flexDirection: 'column' });
  });
});
