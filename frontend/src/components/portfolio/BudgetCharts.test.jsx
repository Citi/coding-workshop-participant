import { screen } from '@testing-library/react';
import BudgetCharts from './BudgetCharts.jsx';
import { renderWithProviders } from '../../test/utils.jsx';
import { BUDGET } from './testFixtures.js';

// jsdom has no layout engine and no ResizeObserver; the charts only need the observer to exist.
class StubResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BudgetCharts', () => {
  it('draws both charts with a title, a description and a legend per series', () => {
    renderWithProviders(<BudgetCharts departments={BUDGET.departments} projects={BUDGET.projects} />);

    expect(screen.getByRole('heading', { name: 'Planned vs spent by department' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Budget used vs work completed' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Planned vs spent by department\./ })).toHaveAccessibleName(
      /The values are listed in the tables below\.$/,
    );
    for (const label of ['Planned', 'Spent', 'Budget used', 'Work completed']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('shows empty states instead of empty axes', () => {
    renderWithProviders(<BudgetCharts departments={[]} projects={[]} />);

    expect(screen.getByText('No departments with projects')).toBeInTheDocument();
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
  });
});
