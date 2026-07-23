import { useState } from 'react';
import { Alert, Chip, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import useApi from '../hooks/useApi';
import useAuth from '../hooks/useAuth';
import { deleteUser, listUsers, updateUserRole } from '../services/authService';
import { ROLE_LABELS, ROLE_OPTIONS } from '../utils/constants';
import { formatDate } from '../utils/formatters';

/**
 * User administration. Admin only -- the route is guarded by manage_users, and
 * the API refuses anyone else regardless.
 *
 * Role changes happen inline: it is the common action, and a dialog for a
 * single dropdown would be friction for no benefit.
 */
export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [deleting, setDeleting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [notice, setNotice] = useState(null);

  const users = useApi(listUsers, { immediate: true, initialData: [] });

  const handleRoleChange = async (row, role) => {
    setServerError(null);
    setNotice(null);
    try {
      await updateUserRole(row.id, role);
      setNotice(`${row.fullName} is now a ${ROLE_LABELS[role] ?? role}.`);
      await users.refresh();
    } catch (caught) {
      // The backend refuses to demote the last remaining Admin; surfacing its
      // message verbatim explains why better than a generic failure would.
      setServerError(caught);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    setServerError(null);
    try {
      await deleteUser(deleting.id);
      setDeleting(null);
      await users.refresh();
    } catch (caught) {
      setServerError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      field: 'fullName',
      header: 'Name',
      primary: true,
      render: (row) => (
        <Stack>
          <Typography variant="body2" fontWeight={600}>
            {row.fullName}
            {row.id === currentUser?.id && (
              <Chip label="You" size="small" sx={{ ml: 1 }} variant="outlined" />
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.email}
          </Typography>
        </Stack>
      ),
    },
    {
      field: 'role',
      header: 'Role',
      render: (row) => (
        <TextField
          select
          size="small"
          value={row.role}
          onChange={(event) => handleRoleChange(row, event.target.value)}
          sx={{ minWidth: 170 }}
          slotProps={{ htmlInput: { 'aria-label': `Role for ${row.fullName}` } }}
        >
          {ROLE_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      ),
    },
    {
      field: 'isActive',
      header: 'Status',
      render: (row) => (
        <Chip
          label={row.isActive ? 'Active' : 'Deactivated'}
          size="small"
          color={row.isActive ? 'success' : 'default'}
        />
      ),
    },
    {
      field: 'createdAt',
      header: 'Joined',
      hideOnMobile: true,
      render: (row) => formatDate(row.createdAt),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Accounts and role assignment"
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        New signups are given a role based on their email address:{' '}
        <code>name.admin@acme.com</code> becomes an Admin, <code>name.mr@acme.com</code> a Project
        Manager, <code>name.tl@acme.com</code> a Team Leader, any other <code>@acme.com</code>{' '}
        address an Employee, and anything else a Stakeholder. Change a role here to override that.
      </Alert>

      <Alert severity="warning" sx={{ mb: 2 }}>
        Sign-up is open and email addresses are not verified, so anyone who can reach the API can
        register a <code>.admin@acme.com</code> address and gain full access. Review this list
        regularly until address verification is in place.
      </Alert>

      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setServerError(null)}>
          {serverError.message}
        </Alert>
      )}

      <DataTable
        columns={columns}
        rows={users.data ?? []}
        loading={users.loading}
        error={users.error}
        onRetry={users.refresh}
        searchPlaceholder="Search users…"
        emptyTitle="No users"
        renderRowActions={(row) => (
          <IconButton
            size="small"
            color="error"
            aria-label={`Delete ${row.fullName}`}
            // The API refuses this too; disabling it here just avoids a
            // pointless round trip and a confusing error.
            disabled={row.id === currentUser?.id}
            title={row.id === currentUser?.id ? 'You cannot delete your own account' : undefined}
            onClick={() => setDeleting(row)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.fullName}?`}
        message="They lose access immediately. Projects they manage are left without a manager."
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        loading={submitting}
        error={serverError}
      />
    </>
  );
}
