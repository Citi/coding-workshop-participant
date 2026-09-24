import { describeStatusChange } from './ticketWorkflow'

/**
 * One timeline for a ticket page: status changes and notes from their own endpoints,
 * plus the current assignment (the ticket's assigned_at; earlier assignments aren't
 * recorded). Oldest first. At the same moment a status change comes before a note.
 *
 * @param {{
 *   history?: Array<{history_id: number, from_status: string|null, to_status: string,
 *     changed_by_user_id: number, changed_by_name: string, changed_by_role: string,
 *     reason: string|null, changed_at: string}>,
 *   notes?: Array<{note_id: number, user_id: number, author_name: string,
 *     author_role: string, note_text: string, created_at: string}>,
 *   assignment?: {name: string|null, at: string|null},
 * }} sources
 * @returns {Array<{kind: 'event'|'note', key: string, at: string, event?: string,
 *   label?: string, reason?: string|null, text?: string,
 *   by: {id: number, name: string, role: string} | null}>}
 */
export function buildThread({ history = [], notes = [], assignment } = {}) {
  const events = history.map((change) => {
    const { label, kind } = describeStatusChange(change)
    return {
      kind: 'event',
      key: `history-${change.history_id}`,
      at: change.changed_at,
      event: kind,
      label,
      reason: change.reason,
      by: { id: change.changed_by_user_id, name: change.changed_by_name, role: change.changed_by_role },
    }
  })
  if (assignment?.name && assignment.at) {
    events.push({
      kind: 'event',
      key: 'assigned',
      at: assignment.at,
      event: 'assigned',
      label: `Assigned to ${assignment.name}`,
      reason: null,
      by: null,
    })
  }
  const messages = notes.map((note) => ({
    kind: 'note',
    key: `note-${note.note_id}`,
    at: note.created_at,
    text: note.note_text,
    by: { id: note.user_id, name: note.author_name, role: note.author_role },
  }))

  const order = { event: 0, note: 1 }
  return [...events, ...messages].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || order[a.kind] - order[b.kind],
  )
}

/**
 * How long something took, in its largest sensible unit: "12 min", "3 h 20 min", "2 d".
 * For "Acknowledged 12 min after you reported it".
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {string}
 */
export function formatDuration(fromIso, toIso) {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000))
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`
  return `${Math.floor(hours / 24)} d`
}
