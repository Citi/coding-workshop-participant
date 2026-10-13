import { useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Alert, MenuItem, Stack, TextField,
} from '@mui/material';
import FormDialog from '../FormDialog';
import useForm from '../../hooks/useForm';
import { api } from '../../services/api';
import { useAuth } from '../../services/AuthContext';
import { ROLE_LABEL, SHOW_EMPTY_OPTION } from '../../utils/format';
import {
  email, minLength, required, username,
} from '../../utils/validators';

const emptyUser = {
  name: '', email: '', username: '', job_title: '', role: 'employee', manager_id: '', password: '',
};

/**
 * Admins create/edit any user (role, reporting manager, password reset).
 * Managers edit only the name and email of employees on their own team.
 */
export default function UserFormDialog({
  open, user = null, managers = [], onClose, onSaved,
}) {
  const { isAdmin } = useAuth();
  const isEdit = Boolean(user);
  const form = useForm(emptyUser, (v) => ({
    name: required(v.name, 'Name'),
    email: required(v.email, 'Email') || email(v.email),
    username: isAdmin ? required(v.username, 'Username') || username(v.username) : undefined,
    password: isAdmin && !isEdit
      ? required(v.password, 'Password') || minLength(v.password, 8)
      : minLength(v.password, 8),
  }));
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset(user ? {
      name: user.name,
      email: user.email,
      username: user.username,
      job_title: user.job_title || '',
      role: user.role,
      manager_id: user.manager_id ?? '',
      password: '',
    } : emptyUser);
  }, [open, user, reset]);

  const handleSubmit = () => form.submit(async (v) => {
    let body = { name: v.name, email: v.email };
    if (isAdmin) {
      body = {
        ...body,
        username: v.username.trim().toLowerCase(),
        job_title: v.job_title,
        role: v.role,
        manager_id: v.role === 'employee' && v.manager_id !== '' ? Number(v.manager_id) : null,
      };
      if (v.password) body.password = v.password;
    }
    const saved = isEdit ? await api.put(`/users/${user.id}`, body) : await api.post('/users', body);
    onSaved(saved);
  });

  const managerOptions = managers.filter((m) => m.id !== user?.id);

  return (
    <FormDialog
      open={open}
      title={isEdit ? `Edit ${user.name}` : 'Add person'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? 'Save changes' : 'Add person'}
      submitting={form.submitting}
      formError={form.formError}
    >
      {!isAdmin && (
        <Alert severity="info">As their manager you can update this person&apos;s name and email. Ask an admin for other changes.</Alert>
      )}
      <TextField label="Full name" required autoFocus {...form.field('name')} />
      <TextField label="Email" type="email" required {...form.field('email')} />
      {isAdmin && (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Username" required {...form.field('username')} />
            <TextField label="Job title" {...form.field('job_title')} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Role" {...form.field('role')}>
              {Object.entries(ROLE_LABEL).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
            </TextField>
            <TextField
              select
              label="Reports to"
              slotProps={SHOW_EMPTY_OPTION}
              disabled={form.values.role !== 'employee'}
              {...form.field('manager_id')}
              helperText={form.errors.manager_id || (form.values.role !== 'employee' ? 'Only employees have a manager.' : 'Each employee has one manager.')}
            >
              <MenuItem value="">No manager yet</MenuItem>
              {managerOptions.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField
            label={isEdit ? 'Reset password (optional)' : 'Temporary password'}
            type="password"
            autoComplete="new-password"
            required={!isEdit}
            {...form.field('password')}
            helperText={form.errors.password || 'At least 8 characters. Share it with the person so they can sign in.'}
          />
        </>
      )}
    </FormDialog>
  );
}

UserFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  user: PropTypes.object,
  managers: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string })),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
