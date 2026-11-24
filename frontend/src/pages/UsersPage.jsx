import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DepartmentsSection from '../components/portfolio/DepartmentsSection.jsx';
import { RoleChip } from '../components/portfolio/Flags.jsx';
import UserDialog from '../components/portfolio/UserDialog.jsx';
import { parseId } from '../components/portfolio/formUtils.js';
import { useDepartmentsLookup } from '../components/portfolio/lookups.js';
import { useAuth } from '../auth/useAuth.js';
import { ROLES, ROLE_LABELS, toOptions } from '../constants.js';
import useApi from '../hooks/useApi.js';
import useDebouncedValue from '../hooks/useDebouncedValue.js';
import usePagination from '../hooks/usePagination.js';
import { useNotify } from '../notifications/useNotify.js';
import { createUser, deleteUser, listUsers, updateUser } from '../services/users.js';
import { formatDate } from '../utils/format.js';

const ROLE_OPTIONS = toOptions(ROLES, ROLE_LABELS);

function buildColumns(currentUserId) {
  return [
    {
      field: 'name',
      header: 'Name',
      primary: true,
      render: (row) => (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box component="span" sx={{ fontWeight: 600 }}>
            {row.name}
          </Box>
          {row.id === currentUserId ? <Chip size="small" label="You" variant="outlined" /> : null}
        </Box>
      ),
    },
    { field: 'email', header: 'Email' },
    { field: 'role', header: 'Role', render: (row) => <RoleChip role={row.role} /> },
    { field: 'department_name', header: 'Department', render: (row) => row.department_name ?? 'No department' },
    { field: 'created_at', header: 'Created', hideOnMobile: true, render: (row) => formatDate(row.created_at) },
  ];
}

/**
 * User administration (route /users, ADMIN only): accounts with search and role and
 * department filters, create (name, email, password, role, department), edit of name, role
 * and department, and delete with confirmation; plus the departments section. Actions are
 * hidden from any role that may not perform them.
 * @returns {JSX.Element} The page.
 */
export default function UsersPage() {
  const { user: currentUser, can } = useAuth();
  const notify = useNotify();
  const departments = useDepartmentsLookup();
  const { page, rowsPerPage, limit, offset, setPage, setRowsPerPage, reset } = usePagination();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [dialog, setDialog] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const query = useDebouncedValue(search, 300).trim();
  const departmentId = parseId(department);
  const { data, loading, error, reload } = useApi(
    (signal) =>
      listUsers(
        { q: query || undefined, role: role || undefined, department_id: departmentId ?? undefined, limit, offset },
        { signal },
      ),
    [query, role, departmentId, limit, offset],
  );

  const currentUserId = currentUser?.id ?? null;
  const columns = buildColumns(currentUserId);
  const canCreate = can('create', 'users');
  const canUpdate = can('update', 'users');
  const canDelete = can('delete', 'users');
  const filtered = Boolean(search || role || department);

  const handleFilterChange = (name, value) => {
    if (name === 'role') {
      setRole(value);
    } else {
      setDepartment(value);
    }
    reset();
  };

  const clearFilters = () => {
    setSearch('');
    setRole('');
    setDepartment('');
    reset();
  };

  const handleSave = async (body) => {
    const editing = dialog?.user ?? null;
    if (editing && Object.keys(body).length === 0) {
      setDialog(null);
      notify.info('Nothing changed.');
      return;
    }
    const saved = editing ? await updateUser(editing.id, body) : await createUser(body);
    setDialog(null);
    notify.success(editing ? `Saved ${saved?.name ?? editing.name}.` : `Created ${saved?.name ?? body.name}.`);
    reload();
  };

  const handleDelete = async () => {
    if (!toDelete) {
      return;
    }
    setDeleting(true);
    try {
      await deleteUser(toDelete.id);
      notify.success(`Deleted ${toDelete.name}.`);
      reload();
    } catch (deleteError) {
      notify.error(deleteError, 'The user could not be deleted.');
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const rowActions =
    canUpdate || canDelete
      ? (row) => (
          <>
            {canUpdate ? (
              <Tooltip title="Edit">
                <IconButton size="small" aria-label={`Edit ${row.name}`} onClick={() => setDialog({ user: row })}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            {canDelete && row.id !== currentUserId ? (
              <Tooltip title="Delete">
                <IconButton size="small" aria-label={`Delete ${row.name}`} onClick={() => setToDelete(row)}>
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
          </>
        )
      : undefined;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Manage accounts, roles and departments. New self-registered accounts start as Viewers."
        actions={
          canCreate ? (
            <Button variant="contained" startIcon={<PersonAddAlt1OutlinedIcon />} onClick={() => setDialog({ user: null })}>
              New user
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          reset();
        }}
        searchLabel="Search users"
        searchPlaceholder="Name or email"
        filters={[
          { name: 'role', label: 'Role', value: role, options: ROLE_OPTIONS, allLabel: 'Any role' },
          {
            name: 'department_id',
            label: 'Department',
            value: department,
            options: departments.options,
            allLabel: 'All departments',
          },
        ]}
        onFilterChange={handleFilterChange}
        onClear={clearFilters}
      />

      <DataTable
        columns={columns}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        rowActions={rowActions}
        ariaLabel="Users"
        emptyTitle={filtered ? 'No users match these filters' : 'No users yet'}
        emptyMessage={filtered ? 'Try another search, role or department, or clear the filters.' : undefined}
        pagination={{
          total: data?.total ?? 0,
          page,
          rowsPerPage,
          onPageChange: setPage,
          onRowsPerPageChange: setRowsPerPage,
        }}
      />

      <DepartmentsSection departments={departments} onChanged={reload} />

      {dialog ? (
        <UserDialog
          user={dialog.user}
          departmentOptions={departments.options}
          isSelf={Boolean(dialog.user) && dialog.user.id === currentUserId}
          onSave={handleSave}
          onClose={() => setDialog(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete user?"
        message={
          toDelete
            ? `${toDelete.name} (${toDelete.email}) will lose access. Their allocations are removed, and their deliverables and projects become unassigned.`
            : undefined
        }
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

/** Takes no props. */
UsersPage.propTypes = {};
