import { screen } from '@testing-library/react';
import AppRoutes from './AppRoutes.jsx';
import { makeAuthValue, makeUser, renderWithProviders } from './test/utils.jsx';

// Simulate a tab opened before a redeploy: the Budget page's old code file no longer exists.
vi.mock('./pages/BudgetPage.jsx', () => {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/BudgetPage-old.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AppRoutes after a redeploy', () => {
  it('offers a full reload when a page’s code file cannot be downloaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const { user } = renderWithProviders(<AppRoutes />, {
      route: '/budget',
      auth: makeAuthValue({ user: makeUser('VIEWER') }),
    });

    expect(await screen.findByText('This page could not be loaded')).toBeInTheDocument();
    // The shell around the page still works, so the user can pick another page.
    expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Reload page' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
