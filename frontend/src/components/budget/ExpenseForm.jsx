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
import { validateExpense } from '../../utils/validators';
import { EXPENSE_CATEGORY_OPTIONS } from '../../utils/constants';
import { toDateInputValue } from '../../utils/formatters';

/**
 * Records spend against a project.
 *
 * The planned figure lives on the project and is edited elsewhere; this only
 * adds actuals. Consumption is the sum of these lines, so the two can never
 * drift out of agreement.
 */

const EMPTY = {
  projectId: '',
  description: '',
  amount: '',
  category: 'labor',
  incurredOn: toDateInputValue(new Date()),
};


export default function ExpenseForm({
  open,
  expense = null,
  projects = [],
  defaultProjectId = '',
  onSubmit,
  onClose,
  submitting = false,
  serverError = null,
}) {
  const isEdit = Boolean(expense);

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(
      expense
        ? {
            projectId: expense.projectId ?? '',
            description: expense.description ?? '',
            amount: expense.amount ?? '',
            category: expense.category ?? 'labor',
            incurredOn: toDateInputValue(expense.incurredOn),
          }
        : { ...EMPTY, projectId: defaultProjectId || '' },
    );
    setErrors({});
    setTouched({});
    setAttempted(false);
  }, [open, expense, defaultProjectId]);

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
    if (attempted) setErrors(validateExpense(next));
  };

  const handleBlur = (event) => {
    setTouched((current) => ({ ...current, [event.target.name]: true }));
    setErrors(validateExpense(values));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setAttempted(true);

    const found = validateExpense(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onSubmit({
      projectId: values.projectId,
      description: values.description.trim() || null,
      amount: Number(values.amount),
      category: values.category,
      incurredOn: values.incurredOn,
    });
  };

  const errorFor = (field) => (touched[field] || attempted ? errors[field] : undefined);
  const hasFieldErrors = Boolean(
    serverError?.fieldErrors && Object.keys(serverError.fieldErrors).length,
  );

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? 'Edit expense' : 'Record an expense'}</DialogTitle>

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
                // Moving an expense between projects would silently rewrite
                // two projects' consumption figures.
                disabled={submitting || isEdit || Boolean(defaultProjectId)}
                helperText={isEdit ? 'An expense cannot be moved between projects' : undefined}
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
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <FormField
                name="amount"
                label="Amount"
                type="number"
                value={values.amount}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('amount')}
                required
                disabled={submitting}
                slotProps={{ htmlInput: { min: 0, step: 100 } }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <FormField
                name="category"
                label="Category"
                value={values.category}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('category')}
                options={EXPENSE_CATEGORY_OPTIONS}
                disabled={submitting}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <FormField
                name="incurredOn"
                label="Date"
                type="date"
                value={values.incurredOn}
                onChange={handleChange}
                onBlur={handleBlur}
                error={errorFor('incurredOn')}
                required
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
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Record expense'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
