/**
 * Up to two initials for an avatar: the first letters of the first and last words of a
 * name, e.g. "Priya Shah" -> "PS", "Cher" -> "C". Blank names give "?".
 * @param {string | null | undefined} fullName
 * @returns {string}
 */
export function initialsFor(fullName) {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}
