import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import RegisterPage from './RegisterPage.jsx';
import { API_BASE_URL } from '../services/apiClient.js';
import { getAccessToken } from '../auth/tokenStorage.js';
import { jsonResponse, renderWithProviders } from '../test/utils.jsx';

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderRegister() {
  return renderWithProviders(
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<p>Dashboard home</p>} />
      <Route path="/login" element={<p>Login screen</p>} />
    </Routes>,
    { route: '/register', realAuth: true },
  );
}

async function fillForm(user, { name = 'Neha Kapoor', email = 'neha@acme.example', password = 'long-enough-1', confirm } = {}) {
  await user.type(screen.getByLabelText(/^full name/i), name);
  await user.type(screen.getByLabelText(/^email/i), email);
  await user.type(screen.getByLabelText(/^password/i), password);
  await user.type(screen.getByLabelText(/^confirm password/i), confirm ?? password);
}

const submit = () => screen.getByRole('button', { name: /create account/i });

describe('RegisterPage', () => {
  it('validates every field before submitting', async () => {
    const { user } = renderRegister();

    await user.click(submit());

    expect(screen.getByText('Enter your full name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Choose a password.')).toBeInTheDocument();
    expect(screen.getByText('Repeat your password.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^full name/i)).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks password length and confirmation', async () => {
    const { user } = renderRegister();

    await fillForm(user, { password: 'short', confirm: 'different' });
    await user.click(submit());

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a duplicate-email conflict from the server', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: 'CONFLICT',
        message: 'An account with this email already exists.',
        details: [{ field: 'email', issue: 'An account with this email already exists.' }],
      }),
    );
    const { user } = renderRegister();

    await fillForm(user);
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(submit()).toBeEnabled();
  });

  it('registers, signs the new user in and opens the dashboard', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(201, { id: 11, name: 'Neha Kapoor', email: 'neha@acme.example', role: 'VIEWER' }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'access-new',
          refresh_token: 'refresh-new',
          token_type: 'bearer',
          expires_in: 1800,
          user: { id: 11, name: 'Neha Kapoor', email: 'neha@acme.example', role: 'VIEWER' },
        }),
      );
    const { user } = renderRegister();

    await fillForm(user);
    await user.click(submit());

    expect(await screen.findByText('Dashboard home')).toBeInTheDocument();
    expect(await screen.findByText(/Welcome, Neha Kapoor/)).toBeInTheDocument();
    const [registerUrl, registerInit] = fetchMock.mock.calls[0];
    expect(registerUrl).toBe(`${API_BASE_URL}/auth/register`);
    expect(JSON.parse(registerInit.body)).toEqual({
      name: 'Neha Kapoor',
      email: 'neha@acme.example',
      password: 'long-enough-1',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE_URL}/auth/login`);
    expect(getAccessToken()).toBe('access-new');
  });

  it('sends the user to sign in when the automatic login fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { id: 12, name: 'A B', email: 'ab@acme.example', role: 'VIEWER' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'UNAUTHENTICATED', message: 'Invalid email or password.' }));
    const { user } = renderRegister();

    await fillForm(user, { name: 'A B', email: 'ab@acme.example' });
    await user.click(submit());

    expect(await screen.findByText('Login screen')).toBeInTheDocument();
  });
});
