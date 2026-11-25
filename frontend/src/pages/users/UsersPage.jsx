import { useCallback, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import DataTable from '../../components/DataTable'
import FilterBar from '../../components/FilterBar'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../context/authContext'
import { useApiQuery } from '../../hooks/useApiQuery'
import { usersApi } from '../../services/usersApi'
import { formatDate } from '../../utils/format'
import { sortLabel } from '../../utils/labels'
import UserDialogs from './UserDialogs'
import { USER_FILTERS } from './userFields'
import UserRowActions from './UserRowActions'
import { hasActiveFilters } from '../../utils/filters'

function buildColumns(currentUserId) {
  return [
    { field: 'full_name', header: 'Name', sortable: true, render: (user) => <UserName user={user} isSelf={user.id === currentUserId} /> },
    {
      field: 'email',
      header: 'Email',
      sortable: true,
      render: (user) => (
        <Box component="span" sx={{ wordBreak: 'break-all' }}>
          {user.email}
        </Box>
      ),
    },
    { field: 'role', header: 'Role', sortable: true, sortValue: (user) => sortLabel('role', user.role), render: (user) => <StatusChip kind="role" value={user.role} /> },
    {
      field: 'is_active',
      header: 'Status',
      sortable: true,
      sortValue: (user) => (user.is_active ? 'Active' : 'Disabled'),
      render: (user) =>
        user.is_active ? (
          <Chip size="small" color="success" variant="outlined" label="Active" />
        ) : (
          <Chip size="small" label="Disabled" />
        ),
    },
    { field: 'created_at', header: 'Created', hideOnMobile: true, sortable: true, render: (user) => formatDate(user.created_at) },
  ]
}

function emptyMessage(filtered, canCreate) {
  if (filtered) return 'No user matches these filters. Try changing or clearing them.'
  return canCreate ? 'Create an account for each person who needs to sign in.' : 'User accounts will appear here once they are created.'
}

/** Admin-only account management: who can sign in and with which role (route guarded by users:read). */
export default function UsersPage() {
  const { can, user: currentUser } = useAuth()
  const [filters, setFilters] = useState({})
  const [dialog, setDialog] = useState(null)

  const fetchUsers = useCallback(() => usersApi.list(filters), [filters])
  const { data, loading, error, reload } = useApiQuery(fetchUsers)
  const currentUserId = currentUser?.id
  const columns = useMemo(() => buildColumns(currentUserId), [currentUserId])

  const canCreate = can('users:create')
  const canUpdate = can('users:update')
  const canDelete = can('users:delete')
  const filtered = hasActiveFilters(filters)
  const openEdit = (user) => setDialog({ mode: 'edit', user })
  const openDelete = (user) => setDialog({ mode: 'delete', user })

  const renderActions = (user) => (
    <UserRowActions
      user={user}
      isSelf={user.id === currentUserId}
      canUpdate={canUpdate}
      canDelete={canDelete}
      onEdit={openEdit}
      onDelete={openDelete}
    />
  )

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Who can sign in, and what their role allows them to do"
        actions={
          canCreate ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ mode: 'create' })}>
              New user
            </Button>
          ) : null
        }
      />
      <FilterBar values={filters} onChange={setFilters} filters={USER_FILTERS} searchPlaceholder="Name or email" />
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Could not load the users"
        refreshErrorTitle="Could not refresh the users"
        renderActions={canUpdate || canDelete ? renderActions : undefined}
        ariaLabel="Users"
        emptyTitle={filtered ? 'No matching users' : 'No users yet'}
        emptyMessage={emptyMessage(filtered, canCreate)}
      />
      <UserDialogs dialog={dialog} currentUserId={currentUserId} onClose={() => setDialog(null)} onSaved={reload} />
    </>
  )
}

/** Full name, with a "You" badge on the logged-in admin's own account. */
function UserName({ user, isSelf }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
      <Box component="span" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
        {user.full_name}
      </Box>
      {isSelf && <Chip size="small" variant="outlined" color="primary" label="You" />}
    </Box>
  )
}
