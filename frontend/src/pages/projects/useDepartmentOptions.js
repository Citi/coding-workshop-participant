import { useMemo, useState } from 'react'

/** Unique department names (case-insensitive, first spelling wins), sorted A-Z. */
export function mergeDepartments(departments, projects) {
  const byKey = new Map(departments.map((name) => [name.toLowerCase(), name]))
  projects.forEach(({ department }) => {
    const name = department?.trim()
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name)
  })
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Department filter options derived from the projects loaded so far. Departments seen in earlier
 * loads are kept, so narrowing the list (e.g. picking one department) never hides the others.
 */
export function useDepartmentOptions(projects) {
  const [known, setKnown] = useState({ source: null, departments: [] })
  if (projects && projects !== known.source) {
    // Adjusting state while rendering (React's documented alternative to an effect).
    setKnown({ source: projects, departments: mergeDepartments(known.departments, projects) })
  }
  return useMemo(() => known.departments.map((name) => ({ value: name, label: name })), [known.departments])
}
