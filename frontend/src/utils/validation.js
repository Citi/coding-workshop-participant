/**
 * Client-side form validation, run before submit. The server validates again; its
 * per-field `details` are merged in with `describeFormError`.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Password limits in UTF-8 bytes; bcrypt rejects anything longer than 72 bytes. */
export const PASSWORD_MIN_BYTES = 8;
export const PASSWORD_MAX_BYTES = 72;
export const NAME_MAX_LENGTH = 150;
export const EMAIL_MAX_LENGTH = 255;

/**
 * Count the UTF-8 bytes of a string (what the server's password limit measures).
 * @param {string} value - Text to measure.
 * @returns {number} Byte length.
 */
export function utf8Length(value) {
  return new TextEncoder().encode(String(value ?? '')).length;
}

/**
 * Check the general shape of an email address.
 * @param {string} value - Email to check.
 * @returns {boolean} True when it looks like name@domain.tld.
 */
export function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value ?? '').trim());
}

function emailError(email) {
  const trimmed = String(email ?? '').trim();
  if (!trimmed) {
    return 'Enter your email address.';
  }
  if (trimmed.length > EMAIL_MAX_LENGTH) {
    return `Email must be at most ${EMAIL_MAX_LENGTH} characters.`;
  }
  if (!isValidEmail(trimmed)) {
    return 'Enter a valid email address, like name@example.com.';
  }
  return null;
}

/**
 * Validate the sign-in form.
 * @param {{email: string, password: string}} values - Form values.
 * @returns {Record<string, string>} Error message per invalid field; empty when valid.
 */
export function validateLogin({ email, password }) {
  const errors = {};
  const emailIssue = emailError(email);
  if (emailIssue) {
    errors.email = emailIssue;
  }
  if (!password) {
    errors.password = 'Enter your password.';
  }
  return errors;
}

/**
 * Validate the registration form.
 * @param {{name: string, email: string, password: string, confirmPassword: string}} values - Form values.
 * @returns {Record<string, string>} Error message per invalid field; empty when valid.
 */
export function validateRegistration({ name, email, password, confirmPassword }) {
  const errors = {};
  const trimmedName = String(name ?? '').trim();
  if (!trimmedName) {
    errors.name = 'Enter your full name.';
  } else if (trimmedName.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be at most ${NAME_MAX_LENGTH} characters.`;
  }
  const emailIssue = emailError(email);
  if (emailIssue) {
    errors.email = emailIssue;
  }
  const bytes = utf8Length(password);
  if (!password) {
    errors.password = 'Choose a password.';
  } else if (bytes < PASSWORD_MIN_BYTES) {
    errors.password = `Password must be at least ${PASSWORD_MIN_BYTES} characters.`;
  } else if (bytes > PASSWORD_MAX_BYTES) {
    errors.password = `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`;
  }
  if (!confirmPassword) {
    errors.confirmPassword = 'Repeat your password.';
  } else if (confirmPassword !== password) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

/**
 * Split an API error into messages for known form fields and one summary line.
 * @param {{message?: string, details?: Array<{field?: string, issue?: string}>}} error - Usually an ApiError.
 * @param {string[]} fields - Field names the form shows.
 * @returns {{fieldErrors: Record<string, string>, message: string}} Per-field errors and a summary
 *   (issues for fields the form does not show are appended to the summary).
 */
export function describeFormError(error, fields) {
  const fieldErrors = {};
  const otherIssues = [];
  const details = Array.isArray(error?.details) ? error.details : [];
  details.forEach((detail) => {
    const field = detail?.field;
    const issue = detail?.issue || 'Invalid value';
    if (field && fields.includes(field)) {
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue;
      }
    } else {
      otherIssues.push(field && field !== 'request' ? `${field}: ${issue}` : issue);
    }
  });
  const base = error?.message || 'Something went wrong. Please try again.';
  return { fieldErrors, message: otherIssues.length > 0 ? `${base} ${otherIssues.join(' ')}` : base };
}
