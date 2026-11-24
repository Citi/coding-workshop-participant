/**
 * Form models for the project, deliverable, budget entry and dependency forms: empty values,
 * values from an existing record, client-side validation and the API request body.
 * Form values are strings (as inputs hold them); payloads use the API's types.
 */
import { BUDGET_CATEGORIES, DELIVERABLE_STATUSES, PROJECT_STATUSES } from '../../constants.js';
import {
  changedFields,
  cleanText,
  compactErrors,
  dateError,
  idOrNull,
  moneyError,
  optionalTextError,
  percentError,
  requiredTextError,
  textOrNull,
  toMoneyString,
} from './formUtils.js';

/** Column limits from the database schema (spec section 6) and the API's request models. */
export const LIMITS = Object.freeze({
  projectName: 200,
  title: 200,
  description: 10000,
  blockedReason: 2000,
  entryDescription: 300,
});

const idText = (value) => (value === null || value === undefined ? '' : String(value));

// --- Projects ------------------------------------------------------------------------------

/** Project form fields in screen order (used for API field errors and focus). */
export const PROJECT_FIELDS = Object.freeze([
  'project_name',
  'department_id',
  'project_manager_id',
  'status',
  'start_date',
  'end_date',
  'planned_budget',
  'description',
]);

/**
 * Values for a new project.
 * @returns {Record<string, string>} Empty form values (status PLANNED).
 */
export function emptyProjectValues() {
  return {
    project_name: '',
    department_id: '',
    project_manager_id: '',
    status: 'PLANNED',
    start_date: '',
    end_date: '',
    planned_budget: '',
    description: '',
  };
}

/**
 * Form values for an existing project.
 * @param {object} project - ProjectOut.
 * @returns {Record<string, string>} Form values.
 */
export function projectToValues(project) {
  return {
    project_name: project.project_name ?? '',
    department_id: idText(project.department_id),
    project_manager_id: idText(project.project_manager_id),
    status: project.status ?? 'PLANNED',
    start_date: project.start_date ?? '',
    end_date: project.end_date ?? '',
    planned_budget: project.planned_budget === null || project.planned_budget === undefined ? '' : String(project.planned_budget),
    description: project.description ?? '',
  };
}

/**
 * Validate project form values before submit.
 * @param {Record<string, string>} values - Form values.
 * @returns {Record<string, string>} Error message per invalid field; empty when valid.
 */
export function validateProject(values) {
  const errors = {
    project_name: requiredTextError(values.project_name, {
      missing: 'Enter a project name.',
      max: LIMITS.projectName,
      label: 'Project name',
    }),
    department_id: idOrNull(values.department_id) ? null : 'Choose a department.',
    status: PROJECT_STATUSES.includes(values.status) ? null : 'Choose a status.',
    start_date: dateError(values.start_date, { required: true, missing: 'Choose a start date.' }),
    end_date: dateError(values.end_date, { required: true, missing: 'Choose an end date.' }),
    planned_budget: moneyError(values.planned_budget, { allowZero: true, label: 'Planned budget' }),
    description: optionalTextError(values.description, { max: LIMITS.description, label: 'Description' }),
  };
  if (!errors.start_date && !errors.end_date && values.end_date < values.start_date) {
    errors.end_date = 'The end date must be on or after the start date.';
  }
  return compactErrors(errors);
}

/**
 * Request body for POST /projects (or the full set of editable fields).
 * @param {Record<string, string>} values - Valid form values.
 * @returns {object} ProjectCreate body.
 */
export function projectPayload(values) {
  return {
    project_name: cleanText(values.project_name),
    department_id: idOrNull(values.department_id),
    project_manager_id: idOrNull(values.project_manager_id),
    status: values.status,
    start_date: cleanText(values.start_date),
    end_date: cleanText(values.end_date),
    planned_budget: toMoneyString(values.planned_budget),
    description: textOrNull(values.description),
  };
}

/**
 * Request body for PUT /projects/{id}: only the fields that changed.
 * @param {Record<string, string>} values - Valid form values.
 * @param {object} project - The project before editing (ProjectOut).
 * @returns {object} Changed fields; empty when nothing changed.
 */
export function projectChanges(values, project) {
  return changedFields(projectPayload(values), projectPayload(projectToValues(project)));
}

// --- Deliverables --------------------------------------------------------------------------

/** Deliverable form fields in screen order. */
export const DELIVERABLE_FIELDS = Object.freeze([
  'title',
  'status',
  'completion_percentage',
  'blocked_reason',
  'assigned_user_id',
  'due_date',
  'start_date',
  'description',
]);

/**
 * Values for a new deliverable.
 * @returns {Record<string, string>} Empty form values (status NOT_STARTED, 0% complete).
 */
export function emptyDeliverableValues() {
  return {
    title: '',
    status: 'NOT_STARTED',
    completion_percentage: '0',
    assigned_user_id: '',
    start_date: '',
    due_date: '',
    blocked_reason: '',
    description: '',
  };
}

/**
 * Form values for an existing deliverable.
 * @param {object} deliverable - DeliverableOut.
 * @returns {Record<string, string>} Form values.
 */
export function deliverableToValues(deliverable) {
  return {
    title: deliverable.title ?? '',
    status: deliverable.status ?? 'NOT_STARTED',
    completion_percentage: idText(deliverable.completion_percentage ?? 0),
    assigned_user_id: idText(deliverable.assigned_user_id),
    start_date: deliverable.start_date ?? '',
    due_date: deliverable.due_date ?? '',
    blocked_reason: deliverable.blocked_reason ?? '',
    description: deliverable.description ?? '',
  };
}

/**
 * Validate deliverable form values before submit.
 * @param {Record<string, string>} values - Form values.
 * @returns {Record<string, string>} Error message per invalid field; empty when valid.
 */
export function validateDeliverable(values) {
  const errors = {
    title: requiredTextError(values.title, { missing: 'Enter a title.', max: LIMITS.title, label: 'Title' }),
    status: DELIVERABLE_STATUSES.includes(values.status) ? null : 'Choose a status.',
    completion_percentage: percentError(values.completion_percentage, { label: 'Completion' }),
    start_date: dateError(values.start_date),
    due_date: dateError(values.due_date, { required: true, missing: 'Choose a due date.' }),
    blocked_reason: optionalTextError(values.blocked_reason, { max: LIMITS.blockedReason, label: 'Blocked reason' }),
    description: optionalTextError(values.description, { max: LIMITS.description, label: 'Description' }),
  };
  if (!errors.start_date && !errors.due_date && cleanText(values.start_date) && values.due_date < values.start_date) {
    errors.due_date = 'The due date must be on or after the start date.';
  }
  if (!errors.completion_percentage && values.status === 'DONE' && Number(values.completion_percentage) !== 100) {
    errors.completion_percentage = 'A done deliverable is 100% complete.';
  }
  return compactErrors(errors);
}

/**
 * Request body for a deliverable. Status DONE sends 100% and a blocked reason is sent only
 * with status BLOCKED, matching the server's rules.
 * @param {Record<string, string>} values - Valid form values.
 * @param {number|null} [projectId] - Owning project; included for create only.
 * @returns {object} DeliverableCreate body (without project_id when projectId is null).
 */
export function deliverablePayload(values, projectId = null) {
  const payload = {
    title: cleanText(values.title),
    status: values.status,
    completion_percentage: values.status === 'DONE' ? 100 : Number(cleanText(values.completion_percentage)),
    assigned_user_id: idOrNull(values.assigned_user_id),
    start_date: textOrNull(values.start_date),
    due_date: cleanText(values.due_date),
    blocked_reason: values.status === 'BLOCKED' ? textOrNull(values.blocked_reason) : null,
    description: textOrNull(values.description),
  };
  return projectId === null ? payload : { project_id: projectId, ...payload };
}

/**
 * Request body for PUT /deliverables/{id}: only the fields that changed.
 * @param {Record<string, string>} values - Valid form values.
 * @param {object} deliverable - The deliverable before editing (DeliverableOut).
 * @returns {object} Changed fields; empty when nothing changed.
 */
export function deliverableChanges(values, deliverable) {
  return changedFields(deliverablePayload(values), deliverablePayload(deliverableToValues(deliverable)));
}

// --- Budget entries ------------------------------------------------------------------------

/** Budget entry form fields in screen order. */
export const BUDGET_ENTRY_FIELDS = Object.freeze(['category', 'amount', 'entry_date', 'description']);

/**
 * Values for a new budget entry.
 * @returns {Record<string, string>} Empty form values.
 */
export function emptyBudgetEntryValues() {
  return { category: '', amount: '', entry_date: '', description: '' };
}

/**
 * Form values for an existing budget entry.
 * @param {object} entry - BudgetEntryOut.
 * @returns {Record<string, string>} Form values.
 */
export function budgetEntryToValues(entry) {
  return {
    category: entry.category ?? '',
    amount: entry.amount === null || entry.amount === undefined ? '' : String(entry.amount),
    entry_date: entry.entry_date ?? '',
    description: entry.description ?? '',
  };
}

/**
 * Validate budget entry form values before submit.
 * @param {Record<string, string>} values - Form values.
 * @returns {Record<string, string>} Error message per invalid field; empty when valid.
 */
export function validateBudgetEntry(values) {
  return compactErrors({
    category: BUDGET_CATEGORIES.includes(values.category) ? null : 'Choose a category.',
    amount: moneyError(values.amount, { label: 'Amount' }),
    entry_date: dateError(values.entry_date, { required: true, missing: 'Choose the date of the spend.' }),
    description: optionalTextError(values.description, { max: LIMITS.entryDescription, label: 'Description' }),
  });
}

/**
 * Request body for a budget entry.
 * @param {Record<string, string>} values - Valid form values.
 * @param {number|null} [projectId] - Owning project; included for create only.
 * @returns {object} BudgetEntryCreate body (without project_id when projectId is null).
 */
export function budgetEntryPayload(values, projectId = null) {
  const payload = {
    category: values.category,
    amount: toMoneyString(values.amount),
    entry_date: cleanText(values.entry_date),
    description: textOrNull(values.description),
  };
  return projectId === null ? payload : { project_id: projectId, ...payload };
}

/**
 * Request body for PUT /budget-entries/{id}: only the fields that changed.
 * @param {Record<string, string>} values - Valid form values.
 * @param {object} entry - The entry before editing (BudgetEntryOut).
 * @returns {object} Changed fields; empty when nothing changed.
 */
export function budgetEntryChanges(values, entry) {
  return changedFields(budgetEntryPayload(values), budgetEntryPayload(budgetEntryToValues(entry)));
}

// --- Dependencies --------------------------------------------------------------------------

/** Dependency form fields in screen order. */
export const DEPENDENCY_FIELDS = Object.freeze(['predecessor_deliverable_id', 'successor_deliverable_id']);

/**
 * Validate the "Add dependency" form.
 * @param {{predecessor_deliverable_id: string, successor_deliverable_id: string}} values - Selected ids.
 * @returns {Record<string, string>} Error message per invalid field; empty when valid.
 */
export function validateDependency(values) {
  const predecessor = idOrNull(values.predecessor_deliverable_id);
  const successor = idOrNull(values.successor_deliverable_id);
  const errors = {
    predecessor_deliverable_id: predecessor ? null : 'Choose the deliverable that must finish first.',
    successor_deliverable_id: successor ? null : 'Choose the deliverable that waits for it.',
  };
  if (predecessor && successor && predecessor === successor) {
    errors.successor_deliverable_id = 'A deliverable cannot depend on itself.';
  }
  return compactErrors(errors);
}

/**
 * Request body for POST /dependencies.
 * @param {{predecessor_deliverable_id: string, successor_deliverable_id: string}} values - Valid values.
 * @returns {{predecessor_deliverable_id: number, successor_deliverable_id: number}} The edge.
 */
export function dependencyPayload(values) {
  return {
    predecessor_deliverable_id: idOrNull(values.predecessor_deliverable_id),
    successor_deliverable_id: idOrNull(values.successor_deliverable_id),
  };
}
