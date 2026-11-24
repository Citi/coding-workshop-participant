import { useState } from 'react';
import PropTypes from 'prop-types';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FormDialog from './FormDialog.jsx';
import { deliverableShape, optionShape } from './shapes.js';
import { fieldProps, isBlank, isDateRangeValid, parseId, parseIntegerInRange, useFormState } from './formUtils.js';
import { DELIVERABLE_STATUSES, STATUS_LABELS } from '../../constants.js';
import { useNotify } from '../../notifications/useNotify.js';
import { describeFormError } from '../../utils/validation.js';

/** Limits from the API schema (deliverables.title is VARCHAR(200)). */
const TITLE_MAX_LENGTH = 200;
const BLOCKED_REASON_MAX_LENGTH = 2000;

const FIELDS = [
  'project_id',
  'title',
  'description',
  'assigned_user_id',
  'start_date',
  'due_date',
  'status',
  'completion_percentage',
  'blocked_reason',
];

function initialValues(deliverable) {
  return {
    project_id: deliverable ? String(deliverable.project_id) : '',
    title: deliverable?.title ?? '',
    description: deliverable?.description ?? '',
    assigned_user_id: deliverable?.assigned_user_id ? String(deliverable.assigned_user_id) : '',
    start_date: deliverable?.start_date ?? '',
    due_date: deliverable?.due_date ?? '',
    status: deliverable?.status ?? 'NOT_STARTED',
    completion_percentage: String(deliverable?.completion_percentage ?? 0),
    blocked_reason: deliverable?.blocked_reason ?? '',
  };
}

/**
 * Check the deliverable form before saving.
 * @param {Record<string, string>} values - Form values.
 * @param {boolean} needsProject - True when creating (the project cannot change later).
 * @returns {Record<string, string>} Error per invalid field.
 */
function validate(values, needsProject) {
  const errors = {};
  if (needsProject && !parseId(values.project_id)) {
    errors.project_id = 'Choose the project.';
  }
  const title = values.title.trim();
  if (!title) {
    errors.title = 'Enter a title.';
  } else if (title.length > TITLE_MAX_LENGTH) {
    errors.title = `Keep the title to ${TITLE_MAX_LENGTH} characters.`;
  }
  if (isBlank(values.due_date)) {
    errors.due_date = 'Choose the due date.';
  } else if (!isDateRangeValid(values.start_date, values.due_date)) {
    errors.due_date = 'The due date must be on or after the start date.';
  }
  if (parseIntegerInRange(values.completion_percentage, 0, 100) === null) {
    errors.completion_percentage = 'Enter a whole number from 0 to 100.';
  }
  if (values.blocked_reason.trim().length > BLOCKED_REASON_MAX_LENGTH) {
    errors.blocked_reason = `Keep the reason to ${BLOCKED_REASON_MAX_LENGTH} characters.`;
  }
  return errors;
}

/**
 * Build the request body from the form. Status DONE always sends 100% complete, and a
 * blocked reason is only kept while the status is BLOCKED (the server applies the same rules).
 * @param {Record<string, string>} values - Valid form values.
 * @param {boolean} includeProject - Send `project_id` (create only; it is immutable).
 * @returns {object} Body for POST or PUT /deliverables.
 */
function toBody(values, includeProject) {
  const body = {
    title: values.title.trim(),
    description: values.description.trim() || null,
    assigned_user_id: parseId(values.assigned_user_id),
    start_date: values.start_date || null,
    due_date: values.due_date,
    status: values.status,
    completion_percentage:
      values.status === 'DONE' ? 100 : parseIntegerInRange(values.completion_percentage, 0, 100),
    blocked_reason: values.status === 'BLOCKED' ? values.blocked_reason.trim() || null : null,
  };
  if (includeProject) {
    body.project_id = parseId(values.project_id);
  }
  return body;
}

/**
 * Create or edit a deliverable (ADMIN, PM and LEAD). The project is chosen on create and
 * fixed afterwards. Choosing Done sets completion to 100%; a blocked reason field appears
 * while the status is Blocked.
 * @param {object} props - Component props.
 * @param {object|null} [props.deliverable] - `DeliverableOut` to edit; omit to create.
 * @param {{value: string, label: string}[]} props.projectOptions - Projects (used when creating).
 * @param {{value: string, label: string}[]} props.userOptions - Possible assignees.
 * @param {(body: object) => Promise<void>} props.onSave - Saves the body; rejects with an ApiError.
 * @param {() => void} props.onClose - Closes the dialog.
 * @returns {JSX.Element} The dialog.
 */
export default function DeliverableDialog({ deliverable = null, projectOptions, userOptions, onSave, onClose }) {
  const isEdit = Boolean(deliverable);
  const notify = useNotify();
  const form = useFormState(() => initialValues(deliverable));
  const { values, setValues, setErrors } = form;
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleStatusChange = (event) => {
    const status = event.target.value;
    setValues((previous) => ({
      ...previous,
      status,
      completion_percentage: status === 'DONE' ? '100' : previous.completion_percentage,
    }));
    setErrors((previous) => ({ ...previous, status: undefined, completion_percentage: undefined }));
  };

  const handleSubmit = async () => {
    const found = validate(values, !isEdit);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) {
      return;
    }
    setSubmitting(true);
    try {
      await onSave(toBody(values, !isEdit));
    } catch (error) {
      const described = describeFormError(error, FIELDS);
      setErrors(described.fieldErrors);
      setFormError(described.message);
      setSubmitting(false);
      notify.error(described.message);
    }
  };

  const done = values.status === 'DONE';
  return (
    <FormDialog
      title={isEdit ? 'Edit deliverable' : 'New deliverable'}
      submitLabel={isEdit ? 'Save changes' : 'Create deliverable'}
      submitting={submitting}
      formError={formError}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <Grid container columnSpacing={2} rowSpacing={1.5} sx={{ pt: 1 }}>
        <Grid size={12}>
          {isEdit ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Project: {deliverable.project_name}
            </Typography>
          ) : (
            <TextField select required label="Project" {...fieldProps(form, 'project_id', { disabled: submitting })}>
              {projectOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Grid>
        <Grid size={12}>
          <TextField
            required
            label="Title"
            autoFocus
            {...fieldProps(form, 'title', { disabled: submitting })}
            slotProps={{ htmlInput: { maxLength: TITLE_MAX_LENGTH } }}
          />
        </Grid>
        <Grid size={12}>
          <TextField
            multiline
            minRows={2}
            label="Description"
            {...fieldProps(form, 'description', { disabled: submitting, helperText: 'Optional' })}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Assignee" {...fieldProps(form, 'assigned_user_id', { disabled: submitting })}>
            <MenuItem value="">Unassigned</MenuItem>
            {userOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            required
            label="Status"
            {...fieldProps(form, 'status', { disabled: submitting })}
            onChange={handleStatusChange}
          >
            {DELIVERABLE_STATUSES.map((status) => (
              <MenuItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            type="date"
            label="Start date"
            {...fieldProps(form, 'start_date', { disabled: submitting, helperText: 'Optional' })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            required
            type="date"
            label="Due date"
            {...fieldProps(form, 'due_date', { disabled: submitting })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            required
            type="number"
            label="Completion (%)"
            {...fieldProps(form, 'completion_percentage', {
              disabled: submitting || done,
              helperText: done ? 'Done means 100%.' : '0 to 100',
            })}
            slotProps={{ htmlInput: { min: 0, max: 100, step: 1, inputMode: 'numeric' } }}
          />
        </Grid>
        {values.status === 'BLOCKED' ? (
          <Grid size={12}>
            <TextField
              multiline
              minRows={2}
              label="Blocked reason"
              {...fieldProps(form, 'blocked_reason', {
                disabled: submitting,
                helperText: 'What is it waiting for? Shown in risk evidence and actions.',
              })}
            />
          </Grid>
        ) : null}
      </Grid>
    </FormDialog>
  );
}

DeliverableDialog.propTypes = {
  deliverable: deliverableShape,
  projectOptions: PropTypes.arrayOf(optionShape).isRequired,
  userOptions: PropTypes.arrayOf(optionShape).isRequired,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
