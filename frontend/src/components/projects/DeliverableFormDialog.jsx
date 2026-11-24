import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FormDialog from './FormDialog.jsx';
import {
  DELIVERABLE_FIELDS,
  LIMITS,
  deliverableChanges,
  deliverablePayload,
  deliverableToValues,
  emptyDeliverableValues,
  validateDeliverable,
} from './entityForms.js';
import { useEntityForm } from './useEntityForm.js';
import { useOptions } from './useOptions.js';
import { DELIVERABLE_STATUSES, STATUS_LABELS } from '../../constants.js';
import { createDeliverable, updateDeliverable } from '../../services/deliverables.js';

const DATE_LABEL_PROPS = { inputLabel: { shrink: true } };

/**
 * Create or edit a deliverable of one project (ADMIN, PM and LEAD). Choosing Done sets 100%
 * complete; the blocked reason appears only for Blocked. Validates before submitting, shows the
 * API's field errors next to the fields, disables the form while saving and sends only changed
 * fields when editing. Mount it with a fresh `key` each time it opens.
 * @param {object} props - Component props.
 * @param {boolean} props.open - Whether the dialog is shown.
 * @param {number} props.projectId - Owning project (used when creating).
 * @param {object|null} [props.deliverable] - DeliverableOut to edit; null or omitted to create.
 * @param {() => void} props.onClose - Called when cancelled.
 * @param {(result: {deliverable: object, changed: boolean}) => void} props.onSaved - Called after saving.
 * @returns {JSX.Element} The dialog.
 */
export default function DeliverableFormDialog({ open, projectId, deliverable = null, onClose, onSaved }) {
  const isEdit = Boolean(deliverable);
  const options = useOptions({
    users: true,
    current:
      deliverable && deliverable.assigned_user_id
        ? { user: { id: deliverable.assigned_user_id, name: deliverable.assigned_user_name } }
        : null,
  });
  const form = useEntityForm({
    initialValues: deliverable ? deliverableToValues(deliverable) : emptyDeliverableValues(),
    fields: DELIVERABLE_FIELDS,
    validate: validateDeliverable,
    submit: async (values) => {
      if (!isEdit) {
        return { deliverable: await createDeliverable(deliverablePayload(values, projectId)), changed: true };
      }
      const changes = deliverableChanges(values, deliverable);
      if (Object.keys(changes).length === 0) {
        return { deliverable, changed: false };
      }
      return { deliverable: await updateDeliverable(deliverable.id, changes), changed: true };
    },
    onSaved,
    failureMessage: isEdit ? 'The deliverable was not updated.' : 'The deliverable was not created.',
  });
  const { fieldProps, values } = form;
  const done = values.status === 'DONE';

  const handleStatusChange = (event) => {
    form.handleChange(event);
    if (event.target.value === 'DONE') {
      form.setValue('completion_percentage', '100');
    }
  };

  return (
    <FormDialog
      open={open}
      title={isEdit ? `Edit ${deliverable.title}` : 'New deliverable'}
      onSubmit={form.handleSubmit}
      onClose={onClose}
      submitting={form.submitting}
      submitLabel={isEdit ? 'Save changes' : 'Create deliverable'}
      formError={form.formError}
    >
      {options.error ? (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={options.reload}>
              Retry
            </Button>
          }
        >
          The list of people could not be loaded.
        </Alert>
      ) : null}
      <Grid container spacing={2}>
        <Grid size={12}>
          <TextField
            label="Title"
            required
            autoFocus
            {...fieldProps('title')}
            slotProps={{ htmlInput: { maxLength: LIMITS.title } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Status" required {...fieldProps('status')} onChange={handleStatusChange}>
            {DELIVERABLE_STATUSES.map((status) => (
              <MenuItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            type="number"
            label="Completion (%)"
            required
            {...fieldProps('completion_percentage', done ? 'Done deliverables are 100% complete' : '0 to 100')}
            disabled={form.submitting || done}
            slotProps={{ htmlInput: { min: 0, max: 100, step: 1, inputMode: 'numeric' } }}
          />
        </Grid>
        {values.status === 'BLOCKED' ? (
          <Grid size={12}>
            <TextField
              label="Blocked reason"
              multiline
              minRows={2}
              {...fieldProps('blocked_reason', 'What is the blocker? Shown in the risk evidence.')}
              slotProps={{ htmlInput: { maxLength: LIMITS.blockedReason } }}
            />
          </Grid>
        ) : null}
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Assignee" {...fieldProps('assigned_user_id', 'Optional')}>
            <MenuItem value="">
              <em>Unassigned</em>
            </MenuItem>
            {options.users.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField type="date" label="Due date" required {...fieldProps('due_date')} slotProps={DATE_LABEL_PROPS} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            type="date"
            label="Start date"
            {...fieldProps('start_date', 'Optional')}
            slotProps={DATE_LABEL_PROPS}
          />
        </Grid>
        <Grid size={12}>
          <TextField
            label="Description"
            multiline
            minRows={2}
            {...fieldProps('description', 'Optional')}
            slotProps={{ htmlInput: { maxLength: LIMITS.description } }}
          />
        </Grid>
      </Grid>
    </FormDialog>
  );
}

DeliverableFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  projectId: PropTypes.number.isRequired,
  deliverable: PropTypes.shape({
    id: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    assigned_user_id: PropTypes.number,
    assigned_user_name: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
