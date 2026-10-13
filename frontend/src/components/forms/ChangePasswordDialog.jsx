import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { TextField } from '@mui/material';
import FormDialog from '../FormDialog';
import useForm from '../../hooks/useForm';
import { api } from '../../services/api';
import { minLength, required } from '../../utils/validators';

const empty = { current_password: '', new_password: '', confirm: '' };

/** Let the signed-in user change their own password. */
export default function ChangePasswordDialog({ open, onClose, onSaved }) {
  const form = useForm(empty, (v) => ({
    current_password: required(v.current_password, 'Current password'),
    new_password: required(v.new_password, 'New password') || minLength(v.new_password, 8),
    confirm: v.confirm !== v.new_password ? 'Passwords do not match.' : undefined,
  }));
  const { reset } = form;

  useEffect(() => {
    if (open) reset(empty);
  }, [open, reset]);

  const handleSubmit = () => form.submit(async (v) => {
    await api.post('/auth/change-password', { current_password: v.current_password, new_password: v.new_password });
    onSaved();
  });

  return (
    <FormDialog
      open={open}
      title="Change password"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Change password"
      submitting={form.submitting}
      formError={form.formError}
      maxWidth="xs"
    >
      <TextField label="Current password" type="password" autoComplete="current-password" required {...form.field('current_password')} />
      <TextField label="New password" type="password" autoComplete="new-password" required {...form.field('new_password')} />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" required {...form.field('confirm')} />
    </FormDialog>
  );
}

ChangePasswordDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
