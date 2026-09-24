import { describe, expect, it } from 'vitest'

import { MAIN_PATH, describeStatusChange, engineerMoves, stepTimes, workflowState } from './ticketWorkflow'

const states = (status) => workflowState(status).steps.map((s) => s.state)

describe('workflowState', () => {
  it('has Blocked off the main path, not as a step on it', () => {
    expect(MAIN_PATH).toEqual(['open', 'in_progress', 'resolved', 'closed'])
    expect(MAIN_PATH).not.toContain('blocked')
  })

  it.each([
    ['open', ['current', 'upcoming', 'upcoming', 'upcoming']],
    ['in_progress', ['done', 'current', 'upcoming', 'upcoming']],
    ['resolved', ['done', 'done', 'current', 'upcoming']],
    ['closed', ['done', 'done', 'done', 'current']],
  ])('%s: main-path states', (status, expected) => {
    expect(states(status)).toEqual(expected)
    expect(workflowState(status).blocked).toBe(false)
  })

  it('shows a Blocked ticket as paused at In progress, with the side state active', () => {
    expect(states('blocked')).toEqual(['done', 'paused', 'upcoming', 'upcoming'])
    expect(workflowState('blocked').blocked).toBe(true)
  })

  it('does not require Blocked to reach Resolved', () => {
    // A resolved ticket that was never blocked has every main step done except the current one.
    const { steps, blocked } = workflowState('resolved')
    expect(blocked).toBe(false)
    expect(steps.filter((s) => s.state === 'done').map((s) => s.status)).toEqual(['open', 'in_progress'])
  })
})

describe('describeStatusChange', () => {
  it.each([
    [null, 'open', 'Opened', 'opened'],
    ['open', 'in_progress', 'In Progress', 'moved'],
    ['in_progress', 'resolved', 'Resolved', 'moved'],
    ['resolved', 'closed', 'Closed', 'moved'],
    ['in_progress', 'blocked', 'Blocked', 'blocked'],
    ['blocked', 'in_progress', 'Unblocked → In Progress', 'unblocked'],
    ['resolved', 'open', 'Reopened → Open', 'reopened'],
    ['resolved', 'in_progress', 'Reopened → In Progress', 'reopened'],
    ['closed', 'open', 'Reopened → Open', 'reopened'],
  ])('%s -> %s reads "%s"', (from, to, label, kind) => {
    expect(describeStatusChange({ from_status: from, to_status: to })).toEqual({ label, kind })
  })
})

describe('engineerMoves', () => {
  it.each([
    ['open', ['in_progress']],
    ['in_progress', ['resolved', 'blocked']],
    ['blocked', ['in_progress']],
    ['resolved', ['in_progress']],
    ['closed', []],
    ['someday-status', []],
  ])('from %s: %o', (status, targets) => {
    expect(engineerMoves(status).map((m) => m.to)).toEqual(targets)
  })

  it('names each move and asks for a reason only when blocking or resolving', () => {
    const labels = ['open', 'in_progress', 'blocked', 'resolved'].flatMap((s) =>
      engineerMoves(s).map((m) => [m.label, Boolean(m.reason)]),
    )
    expect(labels).toEqual([
      ['Start work', false],
      ['Mark resolved…', true],
      ['Mark blocked…', true],
      ['Unblock', false],
      ['Reopen', false],
    ])
  })
})

describe('stepTimes', () => {
  const row = (to, at) => ({ to_status: to, changed_at: at })

  it('is empty without history', () => {
    expect(stepTimes([])).toEqual({})
  })

  it('keeps the latest time per main-path status and skips Blocked', () => {
    expect(
      stepTimes([
        row('open', '2026-09-22T09:00:00Z'),
        row('in_progress', '2026-09-22T10:00:00Z'),
        row('blocked', '2026-09-22T11:00:00Z'),
        row('in_progress', '2026-09-22T12:00:00Z'),
        row('resolved', '2026-09-22T13:00:00Z'),
      ]),
    ).toEqual({
      open: '2026-09-22T09:00:00Z',
      in_progress: '2026-09-22T12:00:00Z',
      resolved: '2026-09-22T13:00:00Z',
    })
  })

  it('does not depend on row order', () => {
    expect(stepTimes([row('open', '2026-09-22T12:00:00Z'), row('open', '2026-09-22T09:00:00Z')])).toEqual({
      open: '2026-09-22T12:00:00Z',
    })
  })
})
