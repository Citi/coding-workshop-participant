import { useState } from 'react';
import { Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';
import RoleGate from '../components/auth/RoleGate';
import ProjectForm from '../components/projects/ProjectForm';
import BudgetBar from '../components/budget/BudgetBar';
import useProjects from '../hooks/useProjects';
import useApi from '../hooks/useApi';
import { listUsers } from '../services/authService';
import useAuth from '../hooks/useAuth';
import { ACTIONS, PROJECT_STATUS_OPTIONS, ROLES } from '../utils/constants';
import { formatDate } from '../utils/formatters';

/**
 * The project list, with create/edit/delete gated by role.
 *
 * Reads and writes go through ProjectContext so a create here updates the
 * dropdowns on every other screen at once.
 */
export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, loading, error, refresh, create, update, remove } = useProjects();
  const { can } = useAuth();

  const [statusFilter, setStatusFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  // Only an Admin may list users, so anyone else gets an empty manager picker
  // rather than a failed request on page load.
  const mayManageUsers = Boolean(can(ACTIONS.MANAGE_USERS));
  const users = useApi(listUsers, { immediate: mayManageUsers, initialData: [] });

  // A project's owner is its Project Manager (schema: projects.owner_id is "the
  // project manager"), so the picker lists only that role -- not every user.
  const managers = (users.data ?? []).filter((user) => user.role === ROLES.PROJECT_MANAGER);

  const rows = statusFilter ? projects.filter((p) => p.status === statusFilter) : projects;

  const openCreate = () => {
    setEditing(null);
    setServerError(null);
    setFormOpen(true);
  };

  const openEdit = (project) => {
    setEditing(project);
    setServerError(null);
    setFormOpen(true);
  };

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    setServerError(null);
    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload);
      }
      setFormOpen(false);
    } catch (caught) {
      // Kept open so the user's input is not lost; the form shows the reason.
      setServerError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    setServerError(null);
    try {
      await remove(deleting.id);
      setDeleting(null);
    } catch (caught) {
      setServerError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      field: 'name',
      header: 'Project',
      primary: true,
      render: (row) => (
        <Stack>
          <Typography variant="body2" fontWeight={600}>
            {row.name}
          </Typography>
          {row.department && (
            <Typography variant="caption" color="text.secondary">
              {row.department}
            </Typography>
          )}
        </Stack>
      ),
    },
    { field: 'status', header: 'Status', render: (row) => <StatusChip value={row.status} /> },
    { field: 'ownerName', header: 'Manager', hideOnMobile: true },
    {
      field: 'endDate',
      header: 'Due',
      render: (row) => formatDate(row.endDate),
    },
    {
      field: 'budgetConsumed',
      header: 'Budget',
      sortable: false,
      render: (row) => (
        <BudgetBar planned={row.plannedBudget} consumed={row.budgetConsumed} showLabels={false} />
      ),
    },
    {
      field: 'atRisk',
      header: 'Risk',
      render: (row) =>
        row.atRisk ? <StatusChip value="High" /> : <Typography variant="body2">—</Typography>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} project${projects.length === 1 ? '' : 's'}`}
        actions={
          <RoleGate action={ACTIONS.CREATE_PROJECTS}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New project
            </Button>
          </RoleGate>
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={refresh}
        initialSortBy="endDate"
        searchPlaceholder="Search projects…"
        onRowClick={(row) => navigate(`/projects/${row.id}`)}
        filters={[
          {
            name: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: PROJECT_STATUS_OPTIONS,
          },
        ]}
        emptyTitle="No projects yet"
        emptyDescription="Create the first project to start tracking deliverables, resources and budget."
        emptyAction={
          <RoleGate action={ACTIONS.CREATE_PROJECTS}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New project
            </Button>
          </RoleGate>
        }
        renderRowActions={(row) => (
          <Stack direction="row" spacing={0.5}>
            {/* Disabled rather than hidden: keeping the column width stable
                across roles avoids the table reflowing per user. */}
            <RoleGate action={ACTIONS.EDIT_PROJECTS} mode="disable">
              <IconButton size="small" aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </RoleGate>
            <RoleGate action={ACTIONS.DELETE_PROJECTS} mode="disable">
              <IconButton
                size="small"
                color="error"
                aria-label={`Delete ${row.name}`}
                onClick={() => setDeleting(row)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </RoleGate>
          </Stack>
        )}
      />

      <ProjectForm
        open={formOpen}
        project={editing}
        managers={managers}
        onSubmit={handleSubmit}
        onClose={() => setFormOpen(false)}
        submitting={submitting}
        serverError={serverError}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name}?`}
        message={
          <>
            This also deletes every deliverable, allocation and expense belonging to it. This
            cannot be undone.
          </>
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        loading={submitting}
        error={serverError}
      />
    </>
  );
}
