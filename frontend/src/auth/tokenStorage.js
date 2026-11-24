/**
 * Session storage for the access token, refresh token and signed-in user.
 * sessionStorage keeps the session per browser tab and clears it when the tab
 * closes (spec 12.2). Every access is guarded because storage can be blocked.
 */

const ACCESS_TOKEN_KEY = 'acme.accessToken';
const REFRESH_TOKEN_KEY = 'acme.refreshToken';
const USER_KEY = 'acme.user';

function readItem(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(key, value) {
  try {
    if (value === null || value === undefined || value === '') {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
    }
  } catch {
    // Storage is unavailable (for example, blocked by the browser): keep going without it.
  }
}

/**
 * Read the current access token.
 * @returns {string|null} The JWT access token, or null when signed out.
 */
export function getAccessToken() {
  return readItem(ACCESS_TOKEN_KEY);
}

/**
 * Read the current refresh token.
 * @returns {string|null} The JWT refresh token, or null when signed out.
 */
export function getRefreshToken() {
  return readItem(REFRESH_TOKEN_KEY);
}

/**
 * Store a new access token, keeping the refresh token.
 * @param {string|null} token - Access token from login or refresh.
 * @returns {void}
 */
export function setAccessToken(token) {
  writeItem(ACCESS_TOKEN_KEY, token);
}

/**
 * Store both tokens after a successful login.
 * @param {{accessToken: string, refreshToken?: string|null}} tokens - Tokens from `/auth/login`.
 * @returns {void}
 */
export function setTokens({ accessToken, refreshToken = null }) {
  writeItem(ACCESS_TOKEN_KEY, accessToken);
  writeItem(REFRESH_TOKEN_KEY, refreshToken);
}

/**
 * Read the cached user profile saved at login.
 * @returns {object|null} The cached `UserOut`, or null.
 */
export function getStoredUser() {
  const raw = readItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const user = JSON.parse(raw);
    return user && typeof user === 'object' ? user : null;
  } catch {
    return null;
  }
}

/**
 * Cache the signed-in user's profile so a page reload restores the session at once.
 * @param {object|null} user - `UserOut` from the API, or null to remove it.
 * @returns {void}
 */
export function setStoredUser(user) {
  writeItem(USER_KEY, user ? JSON.stringify(user) : null);
}

/**
 * Remove both tokens and the cached user (sign out).
 * @returns {void}
 */
export function clearSession() {
  writeItem(ACCESS_TOKEN_KEY, null);
  writeItem(REFRESH_TOKEN_KEY, null);
  writeItem(USER_KEY, null);
}
