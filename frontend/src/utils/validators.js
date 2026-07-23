/**
 * Form validation rules.
 *
 * Kept out of the component files for two reasons: a module that exports both
 * a component and a plain function breaks React Fast Refresh, and these rules
 * are worth testing without mounting a dialog.
 *
 * Each returns `{ field: message }` and an empty object when valid. They
 * mirror the backend specs in each service's models.py -- the server re-validates
 * everything, so these exist to give immediate feedback, not to be trusted.
 */

/** Matches MIN_PASSWORD_LENGTH in backend/auth/models.py. */
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(values, isRegistering) {
  const errors = {};

  if (!values.email?.trim()) {
    errors.email = 'Email is required';
  } else if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = 'Enter a valid email address';
  }

  if (!values.password) {
    errors.password = 'Password is required';
  } else if (isRegistering && values.password.length < MIN_PASSWORD_LENGTH) {
    // Only on signup: an existing password predating the rule must still work.
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (isRegistering && !values.fullName?.trim()) {
    errors.fullName = 'Your name is required';
  }

  return errors;
}

export function validateProject(values) {
  const errors = {};

  if (!values.name?.trim()) {
    errors.name = 'Project name is required';
  } else if (values.name.trim().length < 3) {
    errors.name = 'Use at least 3 characters';
  }

  if (!values.status) errors.status = 'Status is required';

  // Only meaningful once both ends exist; an open-ended project is valid.
  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = 'End date cannot be before the start date';
  }

  if (values.plannedBudget !== '' && Number(values.plannedBudget) < 0) {
    errors.plannedBudget = 'Budget cannot be negative';
  }

  return errors;
}

export function validateDeliverable(values) {
  const errors = {};

  if (!values.name?.trim()) {
    errors.name = 'Deliverable name is required';
  } else if (values.name.trim().length < 3) {
    errors.name = 'Use at least 3 characters';
  }

  if (!values.projectId) errors.projectId = 'Select the project this belongs to';
  if (!values.status) errors.status = 'Status is required';

  const completion = Number(values.completionPercentage);
  if (values.completionPercentage === '' || Number.isNaN(completion)) {
    errors.completionPercentage = 'Completion is required';
  } else if (completion < 0 || completion > 100) {
    errors.completionPercentage = 'Enter a value between 0 and 100';
  }

  return errors;
}

export function validateResource(values) {
  const errors = {};

  if (!values.fullName?.trim()) {
    errors.fullName = 'Name is required';
  } else if (values.fullName.trim().length < 2) {
    errors.fullName = 'Use at least 2 characters';
  }

  if (values.email?.trim() && !EMAIL_RE.test(values.email.trim())) {
    errors.email = 'Enter a valid email address';
  }

  const capacity = Number(values.capacityPct);
  if (values.capacityPct === '' || Number.isNaN(capacity)) {
    errors.capacityPct = 'Capacity is required';
  } else if (capacity < 0 || capacity > 100) {
    // Mirrors the CHECK on resources.capacity_pct.
    errors.capacityPct = 'Enter a value between 0 and 100';
  }

  return errors;
}

export function validateAllocation(values) {
  const errors = {};

  if (!values.resourceId) errors.resourceId = 'Select a person';
  if (!values.projectId) errors.projectId = 'Select a project';
  if (!values.startDate) errors.startDate = 'Start date is required';

  const percent = Number(values.allocationPct);
  if (values.allocationPct === '' || Number.isNaN(percent)) {
    errors.allocationPct = 'Allocation is required';
  } else if (percent < 1 || percent > 100) {
    errors.allocationPct = 'Enter a value between 1 and 100';
  }

  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = 'End date cannot be before the start date';
  }

  return errors;
}

export function validateExpense(values) {
  const errors = {};

  if (!values.projectId) errors.projectId = 'Select a project';

  if (values.amount === '' || values.amount === null || values.amount === undefined) {
    errors.amount = 'Amount is required';
  } else if (Number.isNaN(Number(values.amount))) {
    errors.amount = 'Amount must be a number';
  } else if (Number(values.amount) < 0) {
    errors.amount = 'Amount cannot be negative';
  }

  if (!values.incurredOn) errors.incurredOn = 'Date is required';

  return errors;
}

/** Two date ranges overlap; an absent end date means open-ended. */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return (!bEnd || aStart <= bEnd) && (!aEnd || aEnd >= bStart);
}
