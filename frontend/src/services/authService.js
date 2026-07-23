import { createServiceClient, tokenStore, unwrap } from './api';

/**
 * Authentication, the current user, and user administration.
 *
 * Backed by backend/auth. These are the only calls that touch the token store
 * directly -- everything else reads the session through AuthContext.
 */

const client = createServiceClient('auth');

/**
 * Exchanges credentials for a token pair.
 * `skipAuth` keeps any stale token off the request, so a 401 here always means
 * "wrong credentials" rather than "expired session".
 */
export async function login({ email, password }) {
  const data = await unwrap(client.post('/login', { email, password }, { skipAuth: true }));
  tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.user;
}

/**
 * Self-service signup.
 *
 * The role is decided by the backend from the email address -- see
 * ROLE_HINTS in utils/constants.js for the rules the form explains to the
 * user. The client never sends a role; that would be privilege escalation.
 */
export async function register({ email, password, fullName }) {
  const data = await unwrap(
    client.post('/register', { email, password, fullName }, { skipAuth: true }),
  );
  if (data.accessToken) {
    tokenStore.set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  }
  return data.user;
}

/** Resolves the stored token into a user record -- restores a session on reload. */
export function me() {
  return unwrap(client.get('/me'));
}

/**
 * Ends the session. Local tokens are cleared even if the server call fails,
 * because the user asked to be signed out and the client must honour that
 * regardless of network state.
 */
export async function logout() {
  try {
    await client.post('/logout', { refreshToken: tokenStore.getRefresh() });
  } catch {
    // Best effort: a failed revoke must not strand the user in a signed-in UI.
  } finally {
    tokenStore.clear();
  }
}

export function changePassword({ currentPassword, newPassword }) {
  return unwrap(client.post('/change-password', { currentPassword, newPassword }));
}

// -- User administration (ADMIN only; the backend enforces this) ------------

export function listUsers(params = {}) {
  return unwrap(client.get('/users', { params }));
}

export function getUser(id) {
  return unwrap(client.get(`/users/${id}`));
}

export function createUser(payload) {
  return unwrap(client.post('/users', payload));
}

export function updateUser(id, payload) {
  return unwrap(client.put(`/users/${id}`, payload));
}

export function updateUserRole(id, role) {
  return unwrap(client.patch(`/users/${id}/role`, { role }));
}

export function deleteUser(id) {
  return unwrap(client.delete(`/users/${id}`));
}
