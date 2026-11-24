import { useState } from 'react';
import PropTypes from 'prop-types';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FormDialog from './FormDialog.jsx';
import { fieldProps, parseId, useFormState } from './formUtils.js';
import { optionShape, userShape } from './shapes.js';
import { ROLES, ROLE_LABELS } from '../../constants.js';
import { useNotify } from '../../notifications/useNotify.js';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_BYTES,
  describeFormError,
  isValidEmail,
  utf8Length,
} from '../../utils/validation.js';

const FIELDS = ['name', 'email', 'password', 'role', 'department_id'];

/** What each role may do (spec section 1), shown under the role select. */
const ROLE_HINTS = Object.freeze({
  ADMIN: 'Manages users, roles and departments, and everything else.',
  PM: 'Manages projects, budgets and allocations, and acts on risk.',
  LEAD: 'Creates and updates deliverables and dependencies; cannot delete.',
  VIEWER: 'Reads dashboards and reports only.',
});

function initialValues(user) {
  return {
    name: user?.name ?? '',
    email: user?.email ?? '',
    password: '',
    role: user?.role ?? 'VIEWER',
    department_id: user?.department_id ? String(user.department_id) : '',
  };
}

/**
 * Check the user form before saving.
 * @param {Record<string, string>} values - Form values.
 * @param {boolean} isCreate - New accounts also need an email and a password.
 * @returns {Record<string, string>} Error per invalid field.
 */
function validate(values, isCreate) {
  const errors = {};
  const name = values.name.trim();
  if (!name) {
    errors.name = 'Enter the full name.';
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Keep the name to ${NAME_MAX_LENGTH} characters.`;
  }
  if (isCreate) {
    const email = values.email.trim();
    if (!email) {
      errors.email = 'Enter the email address.';
    } else if (email.length > EMAIL_MAX_LENGTH || !isValidEmail(email)) {
      errors.email = 'Enter a valid email address, like name@example.com.';
    }
    const bytes = utf8Length(values.password);
    if (bytes < PASSWORD_MIN_BYTES || bytes > PASSWORD_MAX_BYTES) {
      errors.password = `Use ${PASSWORD_MIN_BYTES} to ${PASSWORD_MAX_BYTES} bytes (most characters are one byte).`;
    }
  }
  if (!ROLES.includes(values.role)) {
    errors.role = 'Choose a role.';
  }
  return errors;
}

/**
 * Create a user (name, email, password, role, department) or edit one (name, role,
 * department). ADMIN only. On edit only changed fields are sent, and an admin cannot change
 * their own role (the server refuses it as well).
 * @param {object} props - Component props.
 * @param {object|null} [props.user] - `UserOut` to edit; omit to create.
 * @param {{value: string, label: string}[]} props.departmentOptions - Departments to choose from.
 * @param {boolean} [props.isSelf] - The user being edited is the signed-in admin.
 * @param {(body: object) => Promise<void>} props.onSave - Saves the body (empty when nothing changed).
 * @param {() => void} props.onClose - Closes the dialog.
 * @returns {JSX.Element} The dialog.
 */
export default function UserDialog({ user = null, departmentOptions, isSelf = false, onSave, onClose }) {
  const isCreate = !user;
  const notify = useNotify();
  const form = useFormState(() => initialValues(user));
  const { values, setErrors } = form;
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const buildBody = () => {
    const departmentId = parseId(values.department_id);
    if (isCreate) {
      return {
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        role: values.role,
        department_id: departmentId,
      };
    }
    const body = {};
    if (values.name.trim() !== user.name) {
      body.name = values.name.trim();
    }
    if (!isSelf && values.role !== user.role) {
      body.role = values.role;
    }
    if (departmentId !== (user.department_id ?? null)) {
      body.department_id = departmentId;
    }
    return body;
  };

  const handleSubmit = async () => {
    const found = validate(values, isCreate);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) {
      return;
    }
    setSubmitting(true);
    try {
      await onSave(buildBody());
    } catch (error) {
      const described = describeFormError(error, FIELDS);
      setErrors(described.fieldErrors);
      setFormError(described.message);
      setSubmitting(false);
      notify.error(described.message);
    }
  };

  return (
    <FormDialog
      title={isCreate ? 'New user' : `Edit ${user.name}`}
      submitLabel={isCreate ? 'Create user' : 'Save changes'}
      submitting={submitting}
      formError={formError}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <Grid container columnSpacing={2} rowSpacing={1.5} sx={{ pt: 1 }}>
        <Grid size={12}>
          <TextField
            required
            label="Full name"
            autoComplete="off"
            autoFocus
            {...fieldProps(form, 'name', { disabled: submitting })}
          />
        </Grid>
        {isCreate ? (
          <>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                required
                type="email"
                label="Email"
                autoComplete="off"
                {...fieldProps(form, 'email', { disabled: submitting })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                required
                type="password"
                label="Initial password"
                autoComplete="new-password"
                {...fieldProps(form, 'password', {
                  disabled: submitting,
                  helperText: `${PASSWORD_MIN_BYTES} to ${PASSWORD_MAX_BYTES} characters; share it securely.`,
                })}
              />
            </Grid>
          </>
        ) : (
          <Grid size={12}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Email: {user.email}
            </Typography>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            required
            label="Role"
            {...fieldProps(form, 'role', {
              disabled: submitting || isSelf,
              helperText: isSelf ? 'You cannot change your own role.' : ROLE_HINTS[values.role],
            })}
          >
            {ROLES.map((role) => (
              <MenuItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Department" {...fieldProps(form, 'department_id', { disabled: submitting })}>
            <MenuItem value="">No department</MenuItem>
            {departmentOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>
    </FormDialog>
  );
}

UserDialog.propTypes = {
  user: userShape,
  departmentOptions: PropTypes.arrayOf(optionShape).isRequired,
  isSelf: PropTypes.bool,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
