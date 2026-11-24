/**
 * Helpers for the audit log page: readable record names, changed fields and state values.
 * Audit states are JSON snapshots of a row's columns (never a password hash).
 */
import { ENTITY_TYPE_LABELS, humanize } from '../../constants.js';
import { EMPTY_VALUE, formatMoney } from '../../utils/format.js';

/** Bookkeeping columns left out of change summaries (they change on every update). */
const BOOKKEEPING_FIELDS = new Set(['updated_at', 'created_at']);

/** Columns holding money (projects.planned_budget, budget_entries.amount). */
const MONEY_FIELDS = new Set(['planned_budget', 'amount']);

/**
 * Check whether a state column holds a money amount, so it is shown in the platform currency.
 * @param {string} field - Column name.
 * @returns {boolean} True for money columns.
 */
export function isMoneyField(field) {
  return MONEY_FIELDS.has(field);
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Field names present in either state, in a stable order: `id` first, then the order the
 * server wrote them in.
 * @param {object|null} before - State before the change.
 * @param {object|null} after - State after the change.
 * @returns {string[]} Field names.
 */
export function stateFields(before, after) {
  const fields = [...new Set([...Object.keys(after ?? {}), ...Object.keys(before ?? {})])];
  return fields.sort((a, b) => (a === 'id' ? -1 : 0) - (b === 'id' ? -1 : 0));
}

/**
 * Fields whose value differs between the two states.
 * @param {object|null} before - State before the change.
 * @param {object|null} after - State after the change.
 * @param {{includeBookkeeping?: boolean}} [options] - Keep created_at and updated_at.
 * @returns {string[]} Changed field names.
 */
export function changedFields(before, after, { includeBookkeeping = false } = {}) {
  if (!before || !after) {
    return [];
  }
  return stateFields(before, after).filter(
    (field) => (includeBookkeeping || !BOOKKEEPING_FIELDS.has(field)) && !same(before[field], after[field]),
  );
}

/**
 * Check whether one field changed between two states.
 * @param {object|null} before - State before.
 * @param {object|null} after - State after.
 * @param {string} field - Field name.
 * @returns {boolean} True when both states exist and the values differ.
 */
export function isFieldChanged(before, after, field) {
  return Boolean(before && after) && !same(before[field], after[field]);
}

/**
 * Show a state value as text: a dash for empty values, JSON for objects.
 * @param {unknown} value - Value from a state snapshot.
 * @returns {string} Display text.
 */
export function formatStateValue(value) {
  if (value === null || value === undefined || value === '') {
    return EMPTY_VALUE;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Readable name of a field, e.g. `completion_percentage` -> "Completion percentage".
 * @param {string} field - Column name.
 * @returns {string} Label.
 */
export function fieldLabel(field) {
  return humanize(field);
}

/**
 * A human name for the record an audit entry is about, taken from its states.
 * @param {{entity_type: string, before_state: object|null, after_state: object|null}} entry - Audit entry.
 * @returns {string} Title, name or email of the record, or an empty string.
 */
export function recordName(entry) {
  const state = entry.after_state ?? entry.before_state ?? {};
  const name = state.title ?? state.project_name ?? state.name ?? state.email;
  if (name) {
    return String(name);
  }
  if (entry.entity_type === 'dependency' && state.predecessor_deliverable_id) {
    return `Deliverable #${state.predecessor_deliverable_id} → #${state.successor_deliverable_id}`;
  }
  if (entry.entity_type === 'allocation' && state.user_id) {
    return `User #${state.user_id}, ${state.allocation_percentage ?? '?'}% on project #${state.project_id}`;
  }
  if (entry.entity_type === 'budget_entry' && state.amount) {
    return `${humanize(state.category)} ${formatMoney(state.amount)}`;
  }
  return '';
}

/**
 * Label of the entity type and id, e.g. "Project #1".
 * @param {{entity_type: string, entity_id: number|null}} entry - Audit entry.
 * @returns {string} Type label and id.
 */
export function entityLabel(entry) {
  const type = ENTITY_TYPE_LABELS[entry.entity_type] ?? humanize(entry.entity_type);
  return entry.entity_id ? `${type} #${entry.entity_id}` : type;
}

/**
 * One-line summary of what an entry changed.
 * @param {{action: string, before_state: object|null, after_state: object|null}} entry - Audit entry.
 * @returns {string} Summary such as "Changed status and completion percentage".
 */
export function summarizeChange(entry) {
  if (entry.action === 'CREATE') {
    return 'Created this record';
  }
  if (entry.action === 'DELETE') {
    return 'Deleted this record';
  }
  const fields = changedFields(entry.before_state, entry.after_state).map((field) => fieldLabel(field).toLowerCase());
  if (fields.length === 0) {
    return 'Saved without changing any value';
  }
  if (fields.length === 1) {
    return `Changed ${fields[0]}`;
  }
  return `Changed ${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}`;
}
