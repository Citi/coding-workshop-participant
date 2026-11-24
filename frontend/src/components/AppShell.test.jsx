import { screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import AppShell from './AppShell.jsx';
import { PHONE_WIDTH, makeAuthValue, makeUser, renderWithProviders } from '../test/utils.jsx';

function renderShell({ role = 'PM', route = '/', width, auth } = {}) {
  const value = auth ?? makeAuthValue({ user: makeUser(role) });
  const result = renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="*" element={<p>Page body</p>} />
      </Route>
    </Routes>,
    { route, width, auth: value },
  );
  return { ...result, auth: value };
}

const navLinks = () =>
  within(screen.getByRole('navigation', { name: 'Main navigation' }))
    .getAllByRole('link')
    .map((link) => link.textContent);

const BASE_ITEMS = ['Dashboard', 'Projects', 'Deliverables', 'Capacity', 'Budget', 'Risk'];

describe('AppShell navigation', () => {
  it.each([
    ['VIEWER', BASE_ITEMS],
    ['LEAD', BASE_ITEMS],
    ['PM', [...BASE_ITEMS, 'Audit log']],
    ['ADMIN', [...BASE_ITEMS, 'Audit log', 'Users']],
  ])('shows %s the pages their role can open', (role, expected) => {
    renderShell({ role });

    expect(navLinks()).toEqual(expected);
  });

  it('renders the routed page and marks the current section', () => {
    renderShell({ route: '/projects/1' });

    expect(screen.getByText('Page body')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
  });

  it('shows the user and logs out from the account menu', async () => {
    const { user, auth } = renderShell({ role: 'ADMIN' });

    expect(screen.getByText('Vikram Shah')).toBeInTheDocument();
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('pm@acme.example')).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: 'Log out' }));

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});

describe('AppShell on a phone', () => {
  it('uses a temporary drawer opened from the menu button', async () => {
    const { user } = renderShell({ role: 'VIEWER', width: PHONE_WIDTH });

    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(navLinks()).toEqual(BASE_ITEMS);

    await user.click(screen.getByRole('link', { name: 'Risk' }));
    await waitFor(() =>
      expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument(),
    );
  });
});
