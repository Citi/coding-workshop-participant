/** The API's limit on a note (NoteCreate in schemas.py). */
export const NOTE_LIMIT = 2000

/**
 * Why a note can't be sent, or '' if it can: blank, or longer than the API allows.
 * @param {string} text
 * @returns {string}
 */
export function noteError(text) {
  if (!text.trim()) return 'Write a note first.'
  if (text.trim().length > NOTE_LIMIT) return `Use ${NOTE_LIMIT} characters or fewer.`
  return ''
}
