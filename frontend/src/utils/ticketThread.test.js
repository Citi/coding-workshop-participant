import { describe, expect, it } from 'vitest'

import { buildThread, formatDuration } from './ticketThread'

const change = (id, from, to, at, extra = {}) => ({
  history_id: id,
  from_status: from,
  to_status: to,
  changed_by_user_id: 4,
  changed_by_name: 'Sam Tech',
  changed_by_role: 'engineer',
  reason: null,
  changed_at: at,
  ...extra,
})
const note = (id, at, text, extra = {}) => ({
  note_id: id,
  user_id: 1,
  author_name: 'Jane Doe',
  author_role: 'employee',
  note_text: text,
  created_at: at,
  ...extra,
})

describe('buildThread', () => {
  it('is empty with nothing to show', () => {
    expect(buildThread()).toEqual([])
    expect(buildThread({ history: [], notes: [], assignment: { name: null, at: null } })).toEqual([])
  })

  it('merges status changes, the assignment and notes, oldest first', () => {
    const thread = buildThread({
      history: [
        change(1, null, 'open', '2026-09-22T09:00:00Z', { changed_by_user_id: 1, changed_by_name: 'Jane Doe', changed_by_role: 'employee' }),
        change(2, 'open', 'in_progress', '2026-09-22T10:42:00Z'),
        change(3, 'in_progress', 'blocked', '2026-09-22T12:00:00Z', { reason: 'Waiting on parts' }),
      ],
      notes: [note(7, '2026-09-22T10:55:00Z', 'Worst around 11am'), note(6, '2026-09-22T10:41:00Z', 'Changing the channel', { user_id: 4, author_name: 'Sam Tech', author_role: 'engineer' })],
      assignment: { name: 'Sam Tech', at: '2026-09-22T09:15:00Z' },
    })
    expect(thread.map((item) => item.label ?? item.text)).toEqual([
      'Opened',
      'Assigned to Sam Tech',
      'Changing the channel',
      'In Progress',
      'Worst around 11am',
      'Blocked',
    ])
    expect(thread[1]).toMatchObject({ kind: 'event', event: 'assigned', by: null })
    expect(thread[2]).toMatchObject({ kind: 'note', by: { id: 4, name: 'Sam Tech', role: 'engineer' } })
    expect(thread[5]).toMatchObject({ event: 'blocked', reason: 'Waiting on parts' })
  })

  it('puts a status change before a note written at the same moment', () => {
    const at = '2026-09-22T10:00:00Z'
    const thread = buildThread({ history: [change(2, 'in_progress', 'resolved', at)], notes: [note(1, at, 'Done')] })
    expect(thread.map((item) => item.kind)).toEqual(['event', 'note'])
  })

  it('labels reopened and unblocked tickets', () => {
    const thread = buildThread({
      history: [
        change(1, 'resolved', 'in_progress', '2026-09-22T10:00:00Z'),
        change(2, 'blocked', 'in_progress', '2026-09-22T11:00:00Z'),
      ],
    })
    expect(thread.map((item) => [item.event, item.label])).toEqual([
      ['reopened', 'Reopened → In Progress'],
      ['unblocked', 'Unblocked → In Progress'],
    ])
  })

  it('leaves out an assignment without an engineer or a time', () => {
    expect(buildThread({ assignment: { name: 'Sam Tech', at: null } })).toEqual([])
    expect(buildThread({ assignment: { name: null, at: '2026-09-22T10:00:00Z' } })).toEqual([])
  })
})

describe('formatDuration', () => {
  it.each([
    ['2026-09-22T10:00:00Z', '2026-09-22T10:00:20Z', 'under a minute'],
    ['2026-09-22T10:00:00Z', '2026-09-22T10:12:00Z', '12 min'],
    ['2026-09-22T10:00:00Z', '2026-09-22T13:00:00Z', '3 h'],
    ['2026-09-22T10:00:00Z', '2026-09-22T13:20:00Z', '3 h 20 min'],
    ['2026-09-22T10:00:00Z', '2026-09-24T11:00:00Z', '2 d'],
    ['2026-09-22T10:00:00Z', '2026-09-22T09:00:00Z', 'under a minute'],
  ])('%s -> %s is %s', (from, to, expected) => {
    expect(formatDuration(from, to)).toBe(expected)
  })
})
