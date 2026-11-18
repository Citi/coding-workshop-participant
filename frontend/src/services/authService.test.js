import { describe, expect, it } from 'vitest';
import { USERS, mockApi } from '../test/mockApi';
import { getCurrentUser, isAcmeEmail, login, logout, register } from './authService';

describe('authService', () => {
  it('accepts only acme.inc addresses', () => {
    expect(isAcmeEmail(' Jane@ACME.inc ')).toBe(true);
    expect(isAcmeEmail('jane@gmail.com')).toBe(false);
    expect(isAcmeEmail('jane@acme.inc.evil.com')).toBe(false);
  });

  it('login normalises the email and stores the session', async () => {
    const api = mockApi({ 'POST /auth/login': { token: 'tok', user: USERS.employee } });
    const user = await login('  Emma@ACME.inc ', 'Password123!');
    expect(api.calls[0].body).toEqual({ email: 'emma@acme.inc', password: 'Password123!' });
    expect(user).toEqual(USERS.employee);
    expect(getCurrentUser()).toEqual(USERS.employee);

    logout();
    expect(getCurrentUser()).toBeNull();
  });

  it('register refuses other domains without calling the server', async () => {
    const api = mockApi({});
    await expect(register('Jane', 'jane@gmail.com', 'Password123!')).rejects.toThrow('@acme.inc');
    expect(api.calls).toHaveLength(0);
  });

  it('register trims name and email', async () => {
    const api = mockApi({ 'POST /auth/register': { user: USERS.employee } });
    await register('  Jane Doe ', ' Jane@acme.inc', 'Password123!');
    expect(api.calls[0].body).toEqual({ name: 'Jane Doe', email: 'jane@acme.inc', password: 'Password123!' });
  });

  it('ignores a corrupted stored user', () => {
    sessionStorage.setItem('token', 'tok');
    sessionStorage.setItem('user', '{not json');
    expect(getCurrentUser()).toBeNull();
  });
});
