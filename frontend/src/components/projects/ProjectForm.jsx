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
import { validateProject } from '../../utils/validators';
import { PROJECT_STATUS, PROJECT_STATUS_OPTIONS } from '../../utils/constants';
import { toDateInputValue } from '../../utils/formatters';

/**
 * Create/edit dialog for a project.
 *
 * One component serves both modes: passing a `project` switches it to edit and
 * seeds the fields. Validation runs client-side before submit for immediate
 * feedback, and the backend's field errors are merged in afterwards so rules
 * the UI cannot know about still land next to the right input.
 */

const EMPTY = {
  name: '',
  description: '',
  department: '',
  status: PROJECT_STATUS.PLANNING,
  startDate: '',
  endDate: '',
  plannedBudget: '',
  ownerId: '',
};

/** @returns {Record<string, string>} field -> message; empty when valid. */

export default function ProjectForm({
  open,
  project = null,
  managers = [],
  onSubmit,
  onClose,
  submitting = false,
  serverError = null,
}) {
  const isEdit = Boolean(project);

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  // Fields are only marked invalid once touched or once submit is attempted,
  // so a fresh empty form is not a wall of red.
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);

  // Reseed whenever the dialog opens or the record changes. Without the `open`
  // dependency, closing and reopening would keep the previous edits.
  useEffect(() => {
    if (!open) return;
    setValues(
      project
        ? {
            name: project.name ?? '',
            description: project.description ?? '',
            department: project.department ?? '',
            status: project.status ?? PROJECT_STATUS.PLANNING,
            startDate: toDateInputValue(project.startDate),
            endDate: toDateInputValue(project.endDate),
            plannedBudget: project.plannedBudget ?? '',
            ownerId: project.ownerId ?? '',
          }
        : EMPTY,
    );
    setErrors({});
    setTouched({});
    setAttempted(false);
  }, [open, project]);

  // Merge validation errors returned by the API.
  useEffect(() => {
    if (serverError?.fieldErrors && Object.keys(serverError.fieldErrors).length) {
      setErrors((current) => ({ ...current, ...serverError.fieldErrors }));
      setAttempted(true);
    }
  }, [serverError]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const next = { ...values, [name]: value };
    setValues(next);
    if (attempted) setErrors(validateProject(next));
  };

  const handleBlur = (event) => {
    setTouched((current) => ({ ...current, [event.target.name]: true }));
    setErrors(validateProject(values));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setAttempted(true);

    const found = validateProject(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onSubmit({
      name: values.name.trim(),
      description: values.description.trim() || null,
      department: values.department.trim() || null,
      status: values.status,
      // Empty strings are not valid dates, numbers or ids; send null so the
      // backend stores NULL rather than rejecting "".
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      plannedBudget: values.plannedBudget === '' ? 0 : Number(values.plannedBudget),
      ownerId: values.ownerId === '' ? null : values.ownerId,
    });
  };

  const errorFor = (field) => (touched[field] || attempted ? errors[field] : undefined);
  const hasFieldErrors = Boolean(
    serverError?.fieldErrors && Object.keys(serverError.fieldErrors).length,
  );

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      {/* A real form element gives Enter-to-submit and browser autofill. */}
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? `Edit ${project.name}` : 'New project'}</DialogTitle>

        <DialogContent dividers>
          {serverError && !hasFieldErrors && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {serverError.message}
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid size={12}>
              <FormField
                name="name"
                label="Project name"
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
                rows={3}
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="department"
                label="Department"
                value={values.department}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('department')}
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
                options={PROJECT_STATUS_OPTIONS}
                required
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="startDate"
                label="Start date"
                type="date"
                value={values.startDate}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('startDate')}
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="endDate"
                label="Target end date"
                type="date"
                value={values.endDate}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('endDate')}
                helperText="Leave blank if open-ended"
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="plannedBudget"
                label="Planned budget"
                type="number"
                value={values.plannedBudget}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('plannedBudget')}
                disabled={submitting}
                slotProps={{ htmlInput: { min: 0, step: 1000 } }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="ownerId"
                label="Project manager"
                value={values.ownerId}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('ownerId')}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...managers.map((manager) => ({
                    value: manager.id,
                    label: manager.fullName || manager.email,
                  })),
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
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
