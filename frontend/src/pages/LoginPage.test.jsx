import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import LoginPage from './LoginPage.jsx';
import { API_BASE_URL } from '../services/apiClient.js';
import { getAccessToken, getRefreshToken, getStoredUser } from '../auth/tokenStorage.js';
import { jsonResponse, makeUser, renderWithProviders } from '../test/utils.jsx';

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLogin(routeState) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<p>Dashboard home</p>} />
      <Route path="/projects" element={<p>Projects list</p>} />
    </Routes>,
    { route: '/login', routeState, realAuth: true },
  );
}

const emailInput = () => screen.getByLabelText(/^email/i);
const passwordInput = () => screen.getByLabelText(/^password/i);
const submitButton = () => screen.getByRole('button', { name: /sign in/i });

describe('LoginPage validation', () => {
  it('shows field errors next to empty fields and does not call the API', async () => {
    const { user } = renderLogin();

    await user.click(submitButton());

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput()).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before submitting', async () => {
    const { user } = renderLogin();

    await user.type(emailInput(), 'not-an-email');
    await user.type(passwordInput(), 'whatever-password');
    await user.click(submitButton());

    expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'false');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as the field is edited', async () => {
    const { user } = renderLogin();

    await user.click(submitButton());
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    await user.type(passwordInput(), 'x');

    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument();
  });
});

describe('LoginPage server errors', () => {
  it('shows the server message for wrong credentials and re-enables the form', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Invalid email or password.', details: [] }),
    );
    const { user } = renderLogin();

    await user.type(emailInput(), 'pm@acme.example');
    await user.type(passwordInput(), 'wrong-password');
    await user.click(submitButton());

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(submitButton()).toBeEnabled();
    expect(emailInput()).toHaveValue('pm@acme.example');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('shows per-field server details next to the matching field', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'The request is not valid.',
        details: [{ field: 'email', issue: 'Email domain is not accepted.' }],
      }),
    );
    const { user } = renderLogin();

    await user.type(emailInput(), 'pm@acme.example');
    await user.type(passwordInput(), 'some-password');
    await user.click(submitButton());

    expect(await screen.findByText('Email domain is not accepted.')).toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput()).toHaveAccessibleDescription('Email domain is not accepted.');
    expect(screen.getByRole('alert')).toHaveTextContent('The request is not valid.');
  });

  it('explains when the server cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { user } = renderLogin();

    await user.type(emailInput(), 'pm@acme.example');
    await user.type(passwordInput(), 'some-password');
    await user.click(submitButton());

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
  });
});

describe('LoginPage success', () => {
  it('disables the form while signing in, stores the session and returns to the requested page', async () => {
    let resolveLogin;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    const { user } = renderLogin({ from: { pathname: '/projects', search: '', hash: '' } });

    await user.type(emailInput(), '  PM@acme.example ');
    await user.type(passwordInput(), 'correct-password');
    await user.click(submitButton());

    const busyButton = screen.getByRole('button', { name: /signing in/i });
    expect(busyButton).toBeDisabled();
    expect(emailInput()).toBeDisabled();
    expect(passwordInput()).toBeDisabled();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/auth/login`);
    expect(JSON.parse(init.body)).toEqual({ email: 'pm@acme.example', password: 'correct-password' });

    resolveLogin(
      jsonResponse(200, {
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        token_type: 'bearer',
        expires_in: 1800,
        user: makeUser('PM'),
      }),
    );

    expect(await screen.findByText('Projects list')).toBeInTheDocument();
    expect(getAccessToken()).toBe('access-1');
    expect(getRefreshToken()).toBe('refresh-1');
    expect(getStoredUser()).toMatchObject({ email: 'pm@acme.example', role: 'PM' });
  });

  it('goes to the dashboard when no page was requested', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 1800, user: makeUser('VIEWER') }),
    );
    const { user } = renderLogin();

    await user.type(emailInput(), 'viewer@acme.example');
    await user.type(passwordInput(), 'correct-password');
    await user.click(submitButton());

    await waitFor(() => expect(screen.getByText('Dashboard home')).toBeInTheDocument());
  });

  it('tells the user when their session expired', () => {
    renderLogin({ reason: 'expired', from: { pathname: '/risk', search: '', hash: '' } });

    expect(screen.getByText('Your session has expired. Please sign in again.')).toBeInTheDocument();
  });
});
