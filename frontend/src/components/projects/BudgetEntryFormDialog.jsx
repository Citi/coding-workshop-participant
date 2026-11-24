import PropTypes from 'prop-types';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FormDialog from './FormDialog.jsx';
import {
  BUDGET_ENTRY_FIELDS,
  LIMITS,
  budgetEntryChanges,
  budgetEntryPayload,
  budgetEntryToValues,
  emptyBudgetEntryValues,
  validateBudgetEntry,
} from './entityForms.js';
import { currencySymbol } from './formUtils.js';
import { useEntityForm } from './useEntityForm.js';
import { BUDGET_CATEGORIES, CATEGORY_LABELS } from '../../constants.js';
import { createBudgetEntry, updateBudgetEntry } from '../../services/budgetEntries.js';

/**
 * Record or correct spend against a project (ADMIN and PM). Validates before submitting
 * (amount above 0 with at most two decimals), shows the API's field errors next to the
 * fields, disables the form while saving and sends only changed fields when editing.
 * Mount it with a fresh `key` each time it opens.
 * @param {object} props - Component props.
 * @param {boolean} props.open - Whether the dialog is shown.
 * @param {number} props.projectId - Owning project (used when creating).
 * @param {object|null} [props.entry] - BudgetEntryOut to edit; null or omitted to create.
 * @param {() => void} props.onClose - Called when cancelled.
 * @param {(result: {entry: object, changed: boolean}) => void} props.onSaved - Called after saving.
 * @returns {JSX.Element} The dialog.
 */
export default function BudgetEntryFormDialog({ open, projectId, entry = null, onClose, onSaved }) {
  const isEdit = Boolean(entry);
  const form = useEntityForm({
    initialValues: entry ? budgetEntryToValues(entry) : emptyBudgetEntryValues(),
    fields: BUDGET_ENTRY_FIELDS,
    validate: validateBudgetEntry,
    submit: async (values) => {
      if (!isEdit) {
        return { entry: await createBudgetEntry(budgetEntryPayload(values, projectId)), changed: true };
      }
      const changes = budgetEntryChanges(values, entry);
      if (Object.keys(changes).length === 0) {
        return { entry, changed: false };
      }
      return { entry: await updateBudgetEntry(entry.id, changes), changed: true };
    },
    onSaved,
    failureMessage: isEdit ? 'The budget entry was not updated.' : 'The budget entry was not recorded.',
  });
  const { fieldProps } = form;

  return (
    <FormDialog
      open={open}
      title={isEdit ? 'Edit budget entry' : 'Record spend'}
      onSubmit={form.handleSubmit}
      onClose={onClose}
      submitting={form.submitting}
      submitLabel={isEdit ? 'Save changes' : 'Record spend'}
      formError={form.formError}
      maxWidth="xs"
    >
      <Grid container spacing={2}>
        <Grid size={12}>
          <TextField select label="Category" required autoFocus {...fieldProps('category')}>
            {BUDGET_CATEGORIES.map((category) => (
              <MenuItem key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Amount"
            required
            {...fieldProps('amount', 'For example 1500.50')}
            slotProps={{
              htmlInput: { inputMode: 'decimal' },
              input: { startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> },
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            type="date"
            label="Date"
            required
            {...fieldProps('entry_date')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={12}>
          <TextField
            label="Description"
            {...fieldProps('description', 'Optional')}
            slotProps={{ htmlInput: { maxLength: LIMITS.entryDescription } }}
          />
        </Grid>
      </Grid>
    </FormDialog>
  );
}

BudgetEntryFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  projectId: PropTypes.number.isRequired,
  entry: PropTypes.shape({
    id: PropTypes.number.isRequired,
  }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
