import { describe, expect, it } from 'vitest'

import { homePathFor, navLinksFor, roleLabel } from './roles'

describe('homePathFor', () => {
  it.each([
    ['employee', '/dashboard'],
    ['engineer', '/engineer'],
    ['admin', '/admin'],
    ['someday-role', '/dashboard'],
  ])('%s starts at %s', (role, path) => {
    expect(homePathFor(role)).toBe(path)
  })
})

describe('roleLabel', () => {
  it.each([
    ['employee', 'Employee'],
    ['engineer', 'Engineer'],
    ['admin', 'Facility Admin'],
    ['someday-role', 'someday-role'],
  ])('%s reads as "%s"', (role, label) => {
    expect(roleLabel(role)).toBe(label)
  })
})

describe('navLinksFor', () => {
  const current = (role, path) => navLinksFor(role, path).filter((l) => l.current).map((l) => l.label)

  it.each([
    ['employee', [['/dashboard', 'Dashboard'], ['/tickets/new', 'Report an issue']]],
    ['engineer', [['/engineer', 'My queue']]],
    ['admin', [['/admin', 'Dashboard'], ['/admin/people', 'People'], ['/admin/facilities', 'Facilities']]],
    ['someday-role', []],
  ])('gives %s its links in order', (role, expected) => {
    expect(navLinksFor(role, '/').map(({ to, label }) => [to, label])).toEqual(expected)
  })

  it('gives every link an icon key', () => {
    ['employee', 'engineer', 'admin'].forEach((role) => {
      navLinksFor(role, '/').forEach((link) => expect(link.icon).toEqual(expect.any(String)))
    })
  })

  it.each([
    ['/admin', ['Dashboard']],
    ['/admin/tickets/5', ['Dashboard']],
    ['/admin/people', ['People']],
    ['/admin/facilities', ['Facilities']],
    ['/admin/peoplex', ['Dashboard']],
    ['/dashboard', []],
  ])('marks the right admin link current at %s', (path, expected) => {
    expect(current('admin', path)).toEqual(expected)
  })

  it.each([
    ['/dashboard', ['Dashboard']],
    ['/tickets/5', ['Dashboard']],
    ['/tickets/new', ['Report an issue']],
    ['/tickets/newer', ['Dashboard']],
    ['/admin', []],
  ])('marks the right employee link current at %s', (path, expected) => {
    expect(current('employee', path)).toEqual(expected)
  })

  it.each([
    ['/engineer', ['My queue']],
    ['/engineer/tickets/5', ['My queue']],
    ['/engineers', []],
  ])('marks My queue current for engineers at %s', (path, expected) => {
    expect(current('engineer', path)).toEqual(expected)
  })
})
