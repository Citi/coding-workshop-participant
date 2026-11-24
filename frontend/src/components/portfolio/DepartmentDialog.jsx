import { useState } from 'react';
import PropTypes from 'prop-types';
import TextField from '@mui/material/TextField';
import FormDialog from './FormDialog.jsx';
import { fieldProps, useFormState } from './formUtils.js';
import { departmentShape } from './shapes.js';
import { useNotify } from '../../notifications/useNotify.js';
import { describeFormError } from '../../utils/validation.js';

/** departments.name is VARCHAR(100) and unique ignoring case. */
const DEPARTMENT_NAME_MAX_LENGTH = 100;

/**
 * Create or rename a department (ADMIN only). A duplicate name (ignoring case) comes back
 * from the API as 409 CONFLICT and is shown in the dialog.
 * @param {object} props - Component props.
 * @param {object|null} [props.department] - `DepartmentOut` to rename; omit to create.
 * @param {(body: {name: string}) => Promise<void>} props.onSave - Saves the name; rejects with an ApiError.
 * @param {() => void} props.onClose - Closes the dialog.
 * @returns {JSX.Element} The dialog.
 */
export default function DepartmentDialog({ department = null, onSave, onClose }) {
  const notify = useNotify();
  const form = useFormState(() => ({ name: department?.name ?? '' }));
  const { values, setErrors } = form;
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async () => {
    const name = values.name.trim();
    if (!name) {
      setErrors({ name: 'Enter a name.' });
      return;
    }
    if (name.length > DEPARTMENT_NAME_MAX_LENGTH) {
      setErrors({ name: `Keep the name to ${DEPARTMENT_NAME_MAX_LENGTH} characters.` });
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await onSave({ name });
    } catch (error) {
      const described = describeFormError(error, ['name']);
      setErrors(described.fieldErrors);
      setFormError(described.message);
      setSubmitting(false);
      notify.error(described.message);
    }
  };

  return (
    <FormDialog
      title={department ? `Rename ${department.name}` : 'New department'}
      submitLabel={department ? 'Rename' : 'Create department'}
      submitting={submitting}
      formError={formError}
      onSubmit={handleSubmit}
      onClose={onClose}
      maxWidth="xs"
    >
      <TextField
        required
        label="Department name"
        autoFocus
        autoComplete="off"
        {...fieldProps(form, 'name', { disabled: submitting, helperText: 'Must be unique.' })}
        slotProps={{ htmlInput: { maxLength: DEPARTMENT_NAME_MAX_LENGTH } }}
      />
    </FormDialog>
  );
}

DepartmentDialog.propTypes = {
  department: departmentShape,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
