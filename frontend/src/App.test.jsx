import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';
import { saveSession } from './services/apiClient';
import { FACILITIES, USERS, mockApi } from './test/mockApi';

const backend = (extra = {}) => mockApi({
  'GET /notifications/unread-count': { unread_count: 0 },
  'GET /dashboard': { role: 'employee', status_counts: {}, incidents: [] },
  ...extra,
});

describe('App shell', () => {
  it('shows the sign-in page and tab title when signed out', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(document.title).toBe('Sign in · ACME Facility Desk');
  });

  it('signs in, names the user in the tab, and signs out', async () => {
    const user = userEvent.setup();
    backend({ 'POST /auth/login': { token: 'tok', user: USERS.employee } });
    render(<App />);

    await user.type(screen.getByLabelText(/^Work email/), 'emma@acme.inc');
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'Password123!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Hello, Emma' })).toBeInTheDocument();
    expect(document.title).toBe('Emma Employee · ACME Facility Desk');

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(sessionStorage.getItem('token')).toBeNull();
  });

  it('shows admin navigation only to admins', async () => {
    saveSession('tok', USERS.employee);
    backend();
    render(<App />);
    await screen.findByRole('heading', { name: 'Hello, Emma' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).not.toHaveTextContent('Facilities');
    expect(nav).toHaveTextContent('Report incident');
  });

  it('blocks admin pages for other roles', async () => {
    saveSession('tok', USERS.engineer);
    window.location.hash = '#/admin/engineers';
    backend();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Admins only' })).toBeInTheDocument();
  });

  it('routes to the report form and the incident page', async () => {
    saveSession('tok', USERS.admin);
    window.location.hash = '#/incidents/new';
    backend({ 'GET /facilities': FACILITIES });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Report an incident' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Critical' })).toBeInTheDocument(); // admin may report critical
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toHaveTextContent('Engineers');
  });

  it('signs out automatically when the session expires', async () => {
    saveSession('expired', USERS.employee);
    backend({ 'GET /dashboard': { status: 401, body: { message: 'Your session has expired. Please sign in again.' } } });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
