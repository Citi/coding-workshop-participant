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

/**
 * The first word of a name, for greetings: "Priya Shah" -> "Priya". Blank names give "".
 * @param {string | null | undefined} fullName
 * @returns {string}
 */
export function firstNameOf(fullName) {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}

/**
 * "Good morning" before noon, "Good afternoon" until 6 PM, "Good evening" otherwise,
 * in the viewer's local time.
 * @param {Date} [date]
 * @returns {string}
 */
export function greetingFor(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}
