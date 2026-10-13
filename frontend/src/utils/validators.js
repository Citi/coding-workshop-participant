/** Client-side validators mirroring the API's rules, so users get feedback before submitting. */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

/** @returns {string|undefined} */
export const required = (value, label = 'This field') => (
  value === undefined || value === null || String(value).trim() === '' ? `${label} is required.` : undefined
);

/** @returns {string|undefined} */
export const email = (value) => (value && !EMAIL_RE.test(String(value).trim()) ? 'Enter a valid email address.' : undefined);

/** @returns {string|undefined} */
export const username = (value) => (
  value && !USERNAME_RE.test(String(value).trim().toLowerCase())
    ? '3-30 characters: lowercase letters, numbers, . _ -' : undefined
);

/** @returns {string|undefined} */
export const dateOrder = (start, end, label = 'End date') => (
  start && end && end < start ? `${label} must be on or after the start date.` : undefined
);

/** @returns {string|undefined} */
export const nonNegative = (value) => (
  value !== '' && value !== null && value !== undefined && (Number.isNaN(Number(value)) || Number(value) < 0)
    ? 'Enter a number of 0 or more.' : undefined
);

/** @returns {string|undefined} */
export const hours = (value) => {
  const n = Number(value);
  if (value === '' || value === null || value === undefined) return 'Hours are required.';
  if (Number.isNaN(n) || n <= 0 || n > 24) return 'Enter between 0.25 and 24 hours.';
  return undefined;
};

/** @returns {string|undefined} */
export const minLength = (value, min) => (value && String(value).length < min ? `Use at least ${min} characters.` : undefined);
