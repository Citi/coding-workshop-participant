import { STATUSES } from './ticketFormat'

/**
 * The ticket workflow is not a straight line:
 *
 *   Open -> In progress -> Resolved -> Closed      (main path)
 *                |  ^
 *                v  |
 *             Blocked                              (optional side state)
 *
 * Most tickets never become Blocked. When one does, work is paused at the
 * "In progress" stage and resumes there once the blocker is cleared.
 */

export const MAIN_PATH = ['open', 'in_progress', 'resolved', 'closed']

const FINISHED = ['resolved', 'closed']

/** Where a Blocked ticket sits on the main path. */
const BLOCKED_AT = 'in_progress'

/**
 * Each main-path step's state, plus whether the Blocked side state is active.
 * @param {string} status the ticket's current status
 * @returns {{
 *   steps: Array<{status: string, state: 'done' | 'current' | 'paused' | 'upcoming'}>,
 *   blocked: boolean,
 * }}
 */
export function workflowState(status) {
  const blocked = status === 'blocked'
  const position = MAIN_PATH.indexOf(blocked ? BLOCKED_AT : status)

  const steps = MAIN_PATH.map((step, index) => {
    let state = 'upcoming'
    if (index < position) state = 'done'
    else if (index === position) state = blocked ? 'paused' : 'current'
    return { status: step, state }
  })

  return { steps, blocked }
}

/**
 * How one status-history row reads to an employee.
 *   null -> open                    "Opened"
 *   resolved/closed -> anything else "Reopened → <status>"   (work started again)
 *   anything -> blocked              "Blocked"
 *   blocked -> anything              "Unblocked → <status>"
 *   otherwise                        the new status, e.g. "Resolved"
 * @param {{from_status: string|null, to_status: string}} change
 * @returns {{label: string, kind: 'opened'|'reopened'|'blocked'|'unblocked'|'moved'}}
 */
export function describeStatusChange({ from_status: from, to_status: to }) {
  const target = STATUSES[to].label
  if (from === null) return { label: 'Opened', kind: 'opened' }
  if (FINISHED.includes(from) && !FINISHED.includes(to)) {
    return { label: `Reopened → ${target}`, kind: 'reopened' }
  }
  if (to === 'blocked') return { label: 'Blocked', kind: 'blocked' }
  if (from === 'blocked') return { label: `Unblocked → ${target}`, kind: 'unblocked' }
  return { label: target, kind: 'moved' }
}

/**
 * The moves an engineer can make from each status. The API enforces the same table
 * (engineer_ticket_service.ALLOWED_MOVES); this decides which buttons to show.
 * Moves with a `reason` ask for one first: its label, and the hint shown under the box.
 * The first move is the main one (e.g. resolving, rather than blocking, work in progress).
 */
const ENGINEER_MOVES = {
  open: [{ to: 'in_progress', label: 'Start work' }],
  in_progress: [
    {
      to: 'resolved',
      label: 'Mark resolved…',
      reason: { title: 'Mark as resolved', label: 'What did you do?', hint: 'The employee sees this in the ticket history.' },
    },
    {
      to: 'blocked',
      label: 'Mark blocked…',
      reason: { title: 'Mark as blocked', label: 'Why is the work paused?', hint: 'The employee sees this next to "Blocked".' },
    },
  ],
  blocked: [{ to: 'in_progress', label: 'Unblock' }],
  resolved: [{ to: 'in_progress', label: 'Reopen' }],
  closed: [],
}

/**
 * What an engineer can do with a ticket in this status, e.g. "Start work" for an open one.
 * @param {string} status
 * @returns {Array<{to: string, label: string, reason?: {title: string, label: string, hint: string}}>}
 */
export function engineerMoves(status) {
  return ENGINEER_MOVES[status] ?? []
}

/**
 * When the ticket last reached each main-path status, from its status history, e.g.
 * { open: '...', in_progress: '...' }. A status reached twice (after a reopen) keeps
 * its latest time. Blocked rows are ignored: it is a side state, not a step.
 * @param {Array<{to_status: string, changed_at: string}>} history
 * @returns {Record<string, string>}
 */
export function stepTimes(history) {
  const times = {}
  for (const { to_status: to, changed_at: at } of history) {
    if (!MAIN_PATH.includes(to)) continue
    if (!times[to] || Date.parse(at) > Date.parse(times[to])) times[to] = at
  }
  return times
}
