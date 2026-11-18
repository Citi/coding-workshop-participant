import { apiRequest, clearSession, getToken, saveSession } from './apiClient';

export const ACME_DOMAIN = 'acme.inc';

export function isAcmeEmail(email) {
  return email.trim().toLowerCase().endsWith(`@${ACME_DOMAIN}`);
}

/** Sign in any persona. Backend returns { token, user: { id, name, email, role } }. */
export async function login(email, password) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), password },
  });
  saveSession(data.token, data.user);
  return data.user;
}

/** Self-registration is for Employees only; admins create Engineer profiles. */
export async function register(name, email, password) {
  if (!isAcmeEmail(email)) {
    throw new Error(`Registration requires an @${ACME_DOMAIN} email address.`);
  }
  return apiRequest('/auth/register', {
    method: 'POST',
    body: { name: name.trim(), email: email.trim().toLowerCase(), password },
  });
}

export function logout() {
  clearSession();
}

export function getCurrentUser() {
  if (!getToken()) return null;
  try {
    return JSON.parse(sessionStorage.getItem('user'));
  } catch {
    return null;
  }
}
