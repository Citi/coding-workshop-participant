import { screen } from '@testing-library/react';
import AppRoutes from './AppRoutes.jsx';
import { makeAuthValue, makeUser, renderWithProviders } from './test/utils.jsx';

// Pages are lazily loaded; under coverage the first import of a page can take over a second.
const LAZY_PAGE = { timeout: 5000 };

function renderAt(route, role) {
  return renderWithProviders(<AppRoutes />, {
    route,
    auth: makeAuthValue({ user: role ? makeUser(role) : null }),
  });
}

describe('AppRoutes', () => {
  it('sends signed-out visitors to the sign-in page', async () => {
    renderAt('/projects', null);

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' }, LAZY_PAGE)).toBeInTheDocument();
  });

  it('serves the registration page to signed-out visitors', async () => {
    renderAt('/register', null);

    expect(await screen.findByRole('heading', { level: 1, name: 'Create an account' }, LAZY_PAGE)).toBeInTheDocument();
  });

  it('sends a signed-in user away from the sign-in page', async () => {
    renderAt('/login', 'VIEWER');

    expect(await screen.findByRole('heading', { level: 1, name: 'Executive Dashboard' }, LAZY_PAGE)).toBeInTheDocument();
  });

  it.each([
    ['/', 'Executive Dashboard'],
    ['/projects', 'Projects'],
    ['/projects/42', 'Project details'],
    ['/deliverables', 'Deliverables'],
    ['/capacity', 'Resource Capacity'],
    ['/budget', 'Budget Analytics'],
    ['/risk', 'Risk Intelligence'],
  ])('renders %s for any signed-in role', async (route, heading) => {
    renderAt(route, 'VIEWER');

    expect(await screen.findByRole('heading', { level: 1, name: heading }, LAZY_PAGE)).toBeInTheDocument();
  });

  it('shows the project id on the detail placeholder', async () => {
    renderAt('/projects/42', 'LEAD');

    expect(await screen.findByText('Project #42', {}, LAZY_PAGE)).toBeInTheDocument();
  });

  it.each([
    ['/audit', 'PM', 'Audit Log'],
    ['/audit', 'ADMIN', 'Audit Log'],
    ['/users', 'ADMIN', 'Users'],
  ])('opens %s to %s', async (route, role, heading) => {
    renderAt(route, role);

    expect(await screen.findByRole('heading', { level: 1, name: heading }, LAZY_PAGE)).toBeInTheDocument();
  });

  it.each([
    ['/audit', 'LEAD'],
    ['/audit', 'VIEWER'],
    ['/users', 'PM'],
    ['/users', 'VIEWER'],
  ])('denies %s to %s', async (route, role) => {
    renderAt(route, role);

    expect(await screen.findByText('Access denied', {}, LAZY_PAGE)).toBeInTheDocument();
  });

  it('shows a 404 page for unknown paths', async () => {
    renderAt('/no-such-page', 'PM');

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' }, LAZY_PAGE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the dashboard' })).toHaveAttribute('href', '/');
  });
});
