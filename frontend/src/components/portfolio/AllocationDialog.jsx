import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FormDialog from './FormDialog.jsx';
import { fieldProps, isBlank, isDateRangeValid, parseId, parseIntegerInRange, useFormState } from './formUtils.js';
import { LOOKUP_LIMIT } from './lookups.js';
import useApi from '../../hooks/useApi.js';
import { listDeliverables } from '../../services/deliverables.js';
import { describeFormError } from '../../utils/validation.js';

const FIELDS = ['user_id', 'project_id', 'deliverable_id', 'allocation_percentage', 'start_date', 'end_date'];
const NO_ITEMS = Object.freeze([]);

const optionShape = PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.string.isRequired });

function initialValues(allocation, defaultStartDate) {
  if (!allocation) {
    return {
      user_id: '',
      project_id: '',
      deliverable_id: '',
      allocation_percentage: '',
      start_date: defaultStartDate ?? '',
      end_date: '',
    };
  }
  return {
    user_id: String(allocation.user_id),
    project_id: String(allocation.project_id),
    deliverable_id: allocation.deliverable_id ? String(allocation.deliverable_id) : '',
    allocation_percentage: String(allocation.allocation_percentage),
    start_date: allocation.start_date ?? '',
    end_date: allocation.end_date ?? '',
  };
}

/**
 * Check the allocation form before saving.
 * @param {Record<string, string>} values - Form values.
 * @returns {Record<string, string>} Error per invalid field.
 */
function validate(values) {
  const errors = {};
  if (!parseId(values.user_id)) {
    errors.user_id = 'Choose the person.';
  }
  if (!parseId(values.project_id)) {
    errors.project_id = 'Choose the project.';
  }
  if (parseIntegerInRange(values.allocation_percentage, 1, 100) === null) {
    errors.allocation_percentage = 'Enter a whole number from 1 to 100.';
  }
  if (isBlank(values.start_date)) {
    errors.start_date = 'Choose the first day.';
  }
  if (isBlank(values.end_date)) {
    errors.end_date = 'Choose the last day.';
  } else if (!isDateRangeValid(values.start_date, values.end_date)) {
    errors.end_date = 'The last day must be on or after the first day.';
  }
  return errors;
}

/**
 * Create or edit a resource allocation (ADMIN, PM). Saving is never blocked by
 * over-allocation: the parent receives the API response, including `capacity_warning`.
 * @param {object} props - Component props.
 * @param {object|null} [props.allocation] - `AllocationOut` to edit; omit to create.
 * @param {{value: string, label: string}[]} props.userOptions - People to choose from.
 * @param {{value: string, label: string}[]} props.projectOptions - Projects to choose from.
 * @param {string} [props.defaultStartDate] - First day suggested for a new allocation (ISO date).
 * @param {(body: object) => Promise<void>} props.onSave - Saves the body; rejects with an ApiError.
 * @param {() => void} props.onClose - Closes the dialog.
 * @returns {JSX.Element} The dialog.
 */
export default function AllocationDialog({ allocation = null, userOptions, projectOptions, defaultStartDate, onSave, onClose }) {
  const form = useFormState(() => initialValues(allocation, defaultStartDate));
  const { values, setValues, setErrors } = form;
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const projectId = parseId(values.project_id);

  const deliverables = useApi(
    (signal) => listDeliverables({ project_id: projectId, limit: LOOKUP_LIMIT }, { signal }),
    [projectId],
    { enabled: Boolean(projectId) },
  );
  const deliverableItems = projectId ? (deliverables.data?.items ?? NO_ITEMS) : NO_ITEMS;
  const deliverableOptions = useMemo(() => {
    const options = deliverableItems
      .filter((item) => item.project_id === projectId)
      .map((item) => ({ value: String(item.id), label: item.title }));
    // Keep the saved deliverable selectable while the list loads.
    const current = allocation?.deliverable_id ? String(allocation.deliverable_id) : '';
    if (current && projectId === allocation.project_id && !options.some((option) => option.value === current)) {
      options.push({ value: current, label: allocation.deliverable_title || `Deliverable #${current}` });
    }
    return options;
  }, [deliverableItems, projectId, allocation]);

  const handleProjectChange = (event) => {
    const { value } = event.target;
    setValues((previous) => ({ ...previous, project_id: value, deliverable_id: '' }));
    setErrors((previous) => ({ ...previous, project_id: undefined, deliverable_id: undefined }));
  };

  const handleSubmit = async () => {
    const found = validate(values);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) {
      return;
    }
    setSubmitting(true);
    const body = {
      user_id: parseId(values.user_id),
      project_id: projectId,
      deliverable_id: parseId(values.deliverable_id),
      allocation_percentage: parseIntegerInRange(values.allocation_percentage, 1, 100),
      start_date: values.start_date,
      end_date: values.end_date,
    };
    try {
      await onSave(body);
    } catch (error) {
      const described = describeFormError(error, FIELDS);
      setErrors(described.fieldErrors);
      setFormError(described.message);
      setSubmitting(false);
    }
  };

  const isEdit = Boolean(allocation);
  return (
    <FormDialog
      title={isEdit ? 'Edit allocation' : 'New allocation'}
      description="Allocations above 100% are saved and flagged, so conflicts stay visible."
      submitLabel={isEdit ? 'Save changes' : 'Create allocation'}
      submitting={submitting}
      formError={formError}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <Grid container columnSpacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select required label="Person" {...fieldProps(form, 'user_id', { disabled: submitting })}>
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
            label="Project"
            {...fieldProps(form, 'project_id', { disabled: submitting })}
            onChange={handleProjectChange}
          >
            {projectOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 8 }}>
          <TextField
            select
            label="Deliverable"
            {...fieldProps(form, 'deliverable_id', {
              disabled: submitting || !projectId,
              helperText: projectId ? 'Optional: leave as project level.' : 'Choose a project first.',
            })}
          >
            <MenuItem value="">None (project level)</MenuItem>
            {deliverableOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            required
            type="number"
            label="Allocation (%)"
            {...fieldProps(form, 'allocation_percentage', { disabled: submitting, helperText: '1 to 100' })}
            slotProps={{ htmlInput: { min: 1, max: 100, step: 1, inputMode: 'numeric' } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            required
            type="date"
            label="First day"
            {...fieldProps(form, 'start_date', { disabled: submitting })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            required
            type="date"
            label="Last day"
            {...fieldProps(form, 'end_date', { disabled: submitting, helperText: 'Inclusive' })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
      </Grid>
    </FormDialog>
  );
}

AllocationDialog.propTypes = {
  allocation: PropTypes.shape({
    id: PropTypes.number.isRequired,
    user_id: PropTypes.number.isRequired,
    project_id: PropTypes.number.isRequired,
    deliverable_id: PropTypes.number,
    deliverable_title: PropTypes.string,
    allocation_percentage: PropTypes.number.isRequired,
    start_date: PropTypes.string.isRequired,
    end_date: PropTypes.string.isRequired,
  }),
  userOptions: PropTypes.arrayOf(optionShape).isRequired,
  projectOptions: PropTypes.arrayOf(optionShape).isRequired,
  defaultStartDate: PropTypes.string,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
