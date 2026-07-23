/* eslint-disable react-hooks/set-state-in-effect --
 * Seeding form state from the record when the dialog opens is a deliberate
 * prop-to-state sync: the fields are user-editable afterwards, so they cannot
 * be derived on every render. The same applies to merging the server's
 * field errors in once a submit comes back.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
} from '@mui/material';
import FormField from '../common/FormField';
import { validateDeliverable } from '../../utils/validators';
import { DELIVERABLE_STATUS, DELIVERABLE_STATUS_OPTIONS } from '../../utils/constants';
import { toDateInputValue } from '../../utils/formatters';

/**
 * Create/edit dialog for a deliverable.
 *
 * Dependencies are managed separately (see DependencyChain) rather than here:
 * the backend rejects an edge that would close a cycle, and that check needs
 * the deliverable to exist first.
 */

const EMPTY = {
  projectId: '',
  name: '',
  description: '',
  status: DELIVERABLE_STATUS.NOT_STARTED,
  completionPercentage: 0,
  dueDate: '',
  assigneeId: '',
};


export default function DeliverableForm({
  open,
  deliverable = null,
  projects = [],
  assignees = [],
  defaultProjectId = '',
  onSubmit,
  onClose,
  submitting = false,
  serverError = null,
}) {
  const isEdit = Boolean(deliverable);

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(
      deliverable
        ? {
            projectId: deliverable.projectId ?? '',
            name: deliverable.name ?? '',
            description: deliverable.description ?? '',
            status: deliverable.status ?? DELIVERABLE_STATUS.NOT_STARTED,
            completionPercentage: deliverable.completionPercentage ?? 0,
            dueDate: toDateInputValue(deliverable.dueDate),
            assigneeId: deliverable.assigneeId ?? '',
          }
        : // Opened from a project's page, the project is already known.
          { ...EMPTY, projectId: defaultProjectId || '' },
    );
    setErrors({});
    setTouched({});
    setAttempted(false);
  }, [open, deliverable, defaultProjectId]);

  useEffect(() => {
    if (serverError?.fieldErrors && Object.keys(serverError.fieldErrors).length) {
      setErrors((current) => ({ ...current, ...serverError.fieldErrors }));
      setAttempted(true);
    }
  }, [serverError]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const next = { ...values, [name]: value };

    // Mirrors reconcile_completion on the backend, so the form shows the same
    // outcome the API would apply rather than surprising the user on save.
    if (name === 'status' && value === DELIVERABLE_STATUS.COMPLETED) {
      next.completionPercentage = 100;
    }

    setValues(next);
    if (attempted) setErrors(validateDeliverable(next));
  };

  const handleBlur = (event) => {
    setTouched((current) => ({ ...current, [event.target.name]: true }));
    setErrors(validateDeliverable(values));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setAttempted(true);

    const found = validateDeliverable(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onSubmit({
      projectId: values.projectId,
      name: values.name.trim(),
      description: values.description.trim() || null,
      status: values.status,
      completionPercentage: Number(values.completionPercentage),
      dueDate: values.dueDate || null,
      assigneeId: values.assigneeId === '' ? null : values.assigneeId,
    });
  };

  const errorFor = (field) => (touched[field] || attempted ? errors[field] : undefined);
  const hasFieldErrors = Boolean(
    serverError?.fieldErrors && Object.keys(serverError.fieldErrors).length,
  );

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? `Edit ${deliverable.name}` : 'New deliverable'}</DialogTitle>

        <DialogContent dividers>
          {serverError && !hasFieldErrors && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {serverError.message}
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid size={12}>
              <FormField
                name="projectId"
                label="Project"
                value={values.projectId}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('projectId')}
                options={projects.map((project) => ({ value: project.id, label: project.name }))}
                required
                // Moving a deliverable between projects would orphan its
                // dependency edges, which only make sense within one project.
                disabled={submitting || isEdit || Boolean(defaultProjectId)}
                helperText={isEdit ? 'A deliverable cannot be moved between projects' : undefined}
              />
            </Grid>

            <Grid size={12}>
              <FormField
                name="name"
                label="Deliverable name"
                value={values.name}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('name')}
                required
                disabled={submitting}
              />
            </Grid>

            <Grid size={12}>
              <FormField
                name="description"
                label="Description"
                value={values.description}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('description')}
                multiline
                rows={2}
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="status"
                label="Status"
                value={values.status}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('status')}
                options={DELIVERABLE_STATUS_OPTIONS}
                required
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="completionPercentage"
                label="Completion (%)"
                type="number"
                value={values.completionPercentage}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('completionPercentage')}
                required
                disabled={submitting}
                slotProps={{ htmlInput: { min: 0, max: 100, step: 5 } }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="dueDate"
                label="Due date"
                type="date"
                value={values.dueDate}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('dueDate')}
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="assigneeId"
                label="Assignee"
                value={values.assigneeId}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('assigneeId')}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...assignees.map((person) => ({ value: person.id, label: person.fullName })),
                ]}
                disabled={submitting}
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create deliverable'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
