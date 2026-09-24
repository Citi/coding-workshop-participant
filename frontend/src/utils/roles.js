/**
 * Roles and where each one starts. Codes match the API (schemas.py Role).
 * The API enforces access (403); these only decide what the UI shows.
 */

export const ROLES = {
  employee: { label: 'Employee', home: '/dashboard' },
  engineer: { label: 'Engineer', home: '/engineer' },
  admin: { label: 'Facility Admin', home: '/admin' },
}

/**
 * The start page for a role. Unknown roles fall back to the employee dashboard,
 * where the API decides what they may see.
 * @param {string} role
 * @returns {string}
 */
export function homePathFor(role) {
  return ROLES[role]?.home ?? ROLES.employee.home
}

/**
 * A role's display name, e.g. "Facility Admin".
 * @param {string} role
 * @returns {string}
 */
export function roleLabel(role) {
  return ROLES[role]?.label ?? role
}

/**
 * Sidebar navigation per role. `sections` are the path prefixes that mark a link current,
 * so a ticket's details (/admin/tickets/5) still highlight Dashboard. `icon` names an icon
 * in the sidebar's icon map. Only pages that exist today are listed.
 */
export const NAV_LINKS = {
  employee: [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', sections: ['/dashboard', '/tickets'] },
    { to: '/tickets/new', label: 'Report an issue', icon: 'report', sections: ['/tickets/new'] },
  ],
  engineer: [{ to: '/engineer', label: 'My queue', icon: 'dashboard', sections: ['/engineer'] }],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: 'dashboard', sections: ['/admin'] },
    { to: '/admin/people', label: 'People', icon: 'people', sections: ['/admin/people'] },
    { to: '/admin/facilities', label: 'Facilities', icon: 'facilities', sections: ['/admin/facilities'] },
  ],
}

/**
 * The role's sidebar links, each marked `current` for the given path. The longest
 * matching section wins, so /admin/people is People, not Dashboard.
 * @param {string} role
 * @param {string} pathname
 * @returns {{to: string, label: string, icon: string, current: boolean}[]}
 */
export function navLinksFor(role, pathname) {
  const links = NAV_LINKS[role] ?? []
  const inSection = (section) => pathname === section || pathname.startsWith(`${section}/`)
  const longestMatch = (link) => Math.max(0, ...link.sections.filter(inSection).map((s) => s.length))
  const current = links
    .filter((link) => longestMatch(link) > 0)
    .sort((a, b) => longestMatch(b) - longestMatch(a))[0]
  return links.map(({ to, label, icon }) => ({ to, label, icon, current: current?.to === to }))
}
