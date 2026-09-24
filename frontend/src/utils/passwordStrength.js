/**
 * A rough password strength for the register form's meter. It only guides the user; the
 * real rule (at least 8 characters) lives in registerValidation and the API.
 */

export const MIN_PASSWORD_LENGTH = 8

const LABELS = { 1: 'Too short', 2: 'Fair', 3: 'Good', 4: 'Strong' }

/**
 * Score a password from 1 (too short) to 4 (strong). Long passwords and a mix of
 * lowercase, uppercase, digits and symbols score higher.
 * @param {string} password
 * @returns {{score: number, label: string} | null} null for an empty password
 */
export function passwordStrength(password) {
  if (!password) return null
  if (password.length < MIN_PASSWORD_LENGTH) return { score: 1, label: LABELS[1] }
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter((kind) => kind.test(password)).length
  const score = Math.min(4, 2 + (password.length >= 12 ? 1 : 0) + (variety >= 3 ? 1 : 0))
  return { score, label: LABELS[score] }
}
