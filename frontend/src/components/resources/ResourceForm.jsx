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
import { validateResource } from '../../utils/validators';

/**
 * Create/edit dialog for a resource -- a person being tracked.
 *
 * Capacity is the denominator for every utilization figure in the app, which
 * is why it is required and bounded: a zero capacity would make the
 * over-allocation report meaningless.
 */

const EMPTY = {
  fullName: '',
  email: '',
  roleTitle: '',
  capacityPct: 100,
};


export default function ResourceForm({
  open,
  resource = null,
  onSubmit,
  onClose,
  submitting = false,
  serverError = null,
}) {
  const isEdit = Boolean(resource);

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(
      resource
        ? {
            fullName: resource.fullName ?? '',
            email: resource.email ?? '',
            roleTitle: resource.roleTitle ?? '',
            capacityPct: resource.capacityPct ?? 100,
          }
        : EMPTY,
    );
    setErrors({});
    setTouched({});
    setAttempted(false);
  }, [open, resource]);

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
    if (attempted) setErrors(validateResource(next));
  };

  const handleBlur = (event) => {
    setTouched((current) => ({ ...current, [event.target.name]: true }));
    setErrors(validateResource(values));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setAttempted(true);

    const found = validateResource(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onSubmit({
      fullName: values.fullName.trim(),
      email: values.email.trim().toLowerCase() || null,
      roleTitle: values.roleTitle.trim() || null,
      capacityPct: Number(values.capacityPct),
    });
  };

  const errorFor = (field) => (touched[field] || attempted ? errors[field] : undefined);
  const hasFieldErrors = Boolean(
    serverError?.fieldErrors && Object.keys(serverError.fieldErrors).length,
  );

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? `Edit ${resource.fullName}` : 'New resource'}</DialogTitle>

        <DialogContent dividers>
          {serverError && !hasFieldErrors && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {serverError.message}
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="fullName"
                label="Full name"
                value={values.fullName}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('fullName')}
                required
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="email"
                label="Email"
                type="email"
                value={values.email}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('email')}
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="roleTitle"
                label="Role"
                value={values.roleTitle}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('roleTitle')}
                helperText="e.g. Backend Engineer"
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="capacityPct"
                label="Capacity (%)"
                type="number"
                value={values.capacityPct}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('capacityPct')}
                helperText="100 for full time"
                required
                disabled={submitting}
                slotProps={{ htmlInput: { min: 0, max: 100, step: 5 } }}
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
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create resource'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
