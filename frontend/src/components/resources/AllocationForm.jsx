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
import { validateAllocation, rangesOverlap } from '../../utils/validators';
import { toDateInputValue } from '../../utils/formatters';

/**
 * Commits a share of a person's capacity to a project for a date range.
 *
 * The form warns when the allocation would push someone past capacity, but
 * does not block it -- deliberate over-allocation is real, and the brief asks
 * us to surface conflicts rather than forbid them. The backend agrees: it
 * returns 201 with an `overAllocation` block rather than a 400.
 */

const EMPTY = {
  resourceId: '',
  projectId: '',
  allocationPct: 50,
  startDate: toDateInputValue(new Date()),
  endDate: '',
};



export default function AllocationForm({
  open,
  allocation = null,
  resources = [],
  projects = [],
  existingAllocations = [],
  defaultResourceId = '',
  defaultProjectId = '',
  onSubmit,
  onClose,
  submitting = false,
  serverError = null,
}) {
  const isEdit = Boolean(allocation);

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(
      allocation
        ? {
            resourceId: allocation.resourceId ?? '',
            projectId: allocation.projectId ?? '',
            allocationPct: allocation.allocationPct ?? 50,
            startDate: toDateInputValue(allocation.startDate),
            endDate: toDateInputValue(allocation.endDate),
          }
        : { ...EMPTY, resourceId: defaultResourceId || '', projectId: defaultProjectId || '' },
    );
    setErrors({});
    setTouched({});
    setAttempted(false);
  }, [open, allocation, defaultResourceId, defaultProjectId]);

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
    if (attempted) setErrors(validateAllocation(next));
  };

  const handleBlur = (event) => {
    setTouched((current) => ({ ...current, [event.target.name]: true }));
    setErrors(validateAllocation(values));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setAttempted(true);

    const found = validateAllocation(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onSubmit({
      resourceId: values.resourceId,
      projectId: values.projectId,
      allocationPct: Number(values.allocationPct),
      startDate: values.startDate,
      endDate: values.endDate || null,
    });
  };

  const errorFor = (field) => (touched[field] || attempted ? errors[field] : undefined);
  const hasFieldErrors = Boolean(
    serverError?.fieldErrors && Object.keys(serverError.fieldErrors).length,
  );

  // Preview the over-allocation the backend would report, so the warning
  // appears before the user commits rather than after.
  const person = resources.find((r) => r.id === values.resourceId);
  const committedElsewhere = existingAllocations
    .filter(
      (existing) =>
        existing.resourceId === values.resourceId &&
        existing.id !== allocation?.id &&
        values.startDate &&
        rangesOverlap(
          values.startDate,
          values.endDate || null,
          toDateInputValue(existing.startDate),
          toDateInputValue(existing.endDate) || null,
        ),
    )
    .reduce((total, existing) => total + Number(existing.allocationPct || 0), 0);

  const projected = committedElsewhere + Number(values.allocationPct || 0);
  const capacity = Number(person?.capacityPct ?? 100);
  const wouldOverAllocate = person && values.startDate && projected > capacity;

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? 'Edit allocation' : 'Allocate a person'}</DialogTitle>

        <DialogContent dividers>
          {serverError && !hasFieldErrors && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {serverError.message}
            </Alert>
          )}

          {wouldOverAllocate && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {person.fullName} would be allocated {projected}% against a capacity of {capacity}%
              over an overlapping period ({committedElsewhere}% is already committed). You can
              still save this.
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="resourceId"
                label="Person"
                value={values.resourceId}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('resourceId')}
                options={resources.map((resource) => ({
                  value: resource.id,
                  label: resource.roleTitle
                    ? `${resource.fullName} — ${resource.roleTitle}`
                    : resource.fullName,
                }))}
                required
                // Reassigning an allocation would rewrite two people's
                // utilization history, so both ends are fixed after creation.
                disabled={submitting || isEdit || Boolean(defaultResourceId)}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="projectId"
                label="Project"
                value={values.projectId}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('projectId')}
                options={projects.map((project) => ({ value: project.id, label: project.name }))}
                required
                disabled={submitting || isEdit || Boolean(defaultProjectId)}
              />
            </Grid>

            <Grid size={12}>
              <FormField
                name="allocationPct"
                label="Allocation (%)"
                type="number"
                value={values.allocationPct}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('allocationPct')}
                helperText="Share of this person's capacity"
                required
                disabled={submitting}
                slotProps={{ htmlInput: { min: 1, max: 100, step: 5 } }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="startDate"
                label="From"
                type="date"
                value={values.startDate}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('startDate')}
                required
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="endDate"
                label="Until"
                type="date"
                value={values.endDate}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('endDate')}
                helperText="Leave blank if ongoing"
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
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Allocate'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
