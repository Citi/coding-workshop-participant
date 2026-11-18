import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { USERS, mockApi } from '../test/mockApi';
import Login from './Login';

const fill = async (user, fields) => {
  for (const [label, value] of Object.entries(fields)) {
    await user.type(screen.getByLabelText(new RegExp(`^${label}`), { selector: 'input' }), value);
  }
};

describe('Login page', () => {
  it('signs in and hands the user to the app', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    mockApi({ 'POST /auth/login': { token: 'tok', user: USERS.admin } });
    render(<Login onLogin={onLogin} />);

    await fill(user, { 'Work email': 'alice.admin@acme.inc', Password: 'Password123!' });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(USERS.admin));
  });

  it('validates before calling the server', async () => {
    const user = userEvent.setup();
    const api = mockApi({});
    render(<Login />);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Email and password are required.');

    await fill(user, { 'Work email': 'me@gmail.com', Password: 'Password123!' });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please use your @acme.inc email address.');
    expect(api.calls).toHaveLength(0);
  });

  it('shows the server error for bad credentials', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /auth/login': { status: 401, body: { message: 'Invalid email or password.' } } });
    render(<Login />);

    await fill(user, { 'Work email': 'emma@acme.inc', Password: 'wrong-password' });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('disables the button while signing in', async () => {
    const user = userEvent.setup();
    let release;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { release = resolve; })));
    render(<Login />);

    await fill(user, { 'Work email': 'emma@acme.inc', Password: 'Password123!' });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    release(new Response(JSON.stringify({ message: 'nope' }), { status: 401 }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('registers an employee, then returns to sign in', async () => {
    const user = userEvent.setup();
    const api = mockApi({ 'POST /auth/register': { status: 201, body: { user: USERS.employee } } });
    render(<Login />);

    await user.click(screen.getByRole('tab', { name: 'Register' }));
    await fill(user, {
      'Full name': 'Jane Doe', 'Work email': 'jane@acme.inc', Password: 'Password123!', 'Confirm password': 'Password123!',
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Account created. You can now sign in.');
    expect(screen.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
    expect(api.calls[0].body).toMatchObject({ name: 'Jane Doe', email: 'jane@acme.inc' });
  });

  it('checks registration fields', async () => {
    const user = userEvent.setup();
    mockApi({});
    render(<Login />);
    await user.click(screen.getByRole('tab', { name: 'Register' }));

    await fill(user, { 'Work email': 'jane@acme.inc', Password: 'short', 'Confirm password': 'short' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your full name.');

    await fill(user, { 'Full name': 'Jane' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters');

    await fill(user, { Password: '-long-enough', 'Confirm password': '-different!' });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
  });

  it('can reveal the password', async () => {
    const user = userEvent.setup();
    render(<Login />);
    const input = screen.getByLabelText(/^Password/, { selector: 'input' });
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});
