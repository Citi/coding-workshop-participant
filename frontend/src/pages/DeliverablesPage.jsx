import { useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatusChip from '../components/common/StatusChip';
import RoleGate from '../components/auth/RoleGate';
import DeliverableForm from '../components/deliverables/DeliverableForm';
import useApi from '../hooks/useApi';
import useProjects from '../hooks/useProjects';
import {
  createDeliverable,
  deleteDeliverable,
  listDeliverables,
  updateDeliverable,
} from '../services/deliverableService';
import { listResources } from '../services/resourceService';
import { ACTIONS, DELIVERABLE_STATUS_OPTIONS } from '../utils/constants';
import { formatDate } from '../utils/formatters';

/**
 * All deliverables across every project.
 *
 * `projectId` can be passed in so ProjectDetailsPage reuses this table scoped
 * to one project rather than maintaining a second copy of the same columns.
 */
export default function DeliverablesPage({ projectId = null, embedded = false }) {
  const { projects } = useProjects();

  const [statusFilter, setStatusFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  const deliverables = useApi(
    () => listDeliverables(projectId ? { projectId } : {}),
    { immediate: true, deps: [projectId], initialData: [] },
  );

  const resources = useApi(listResources, { immediate: true, initialData: [] });

  const rows = (deliverables.data ?? []).filter(
    (row) => !statusFilter || row.status === statusFilter,
  );

  const openCreate = () => {
    setEditing(null);
    setServerError(null);
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setServerError(null);
    setFormOpen(true);
  };

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    setServerError(null);
    try {
      if (editing) {
        await updateDeliverable(editing.id, payload);
      } else {
        await createDeliverable(payload);
      }
      setFormOpen(false);
      await deliverables.refresh();
    } catch (caught) {
      setServerError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    setServerError(null);
    try {
      await deleteDeliverable(deleting.id);
      setDeleting(null);
      await deliverables.refresh();
    } catch (caught) {
      setServerError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  // Rather than delete an assigned deliverable and silently drop the
  // assignment, offer to hand it to someone else instead: close the dialog and
  // reopen the edit form on the same record so a new assignee can be chosen.
  const handleReassign = () => {
    const target = deleting;
    setDeleting(null);
    openEdit(target);
  };

  const columns = [
    {
      field: 'name',
      header: 'Deliverable',
      primary: true,
      render: (row) => (
        <Typography variant="body2" fontWeight={600}>
          {row.name}
        </Typography>
      ),
    },
    // Redundant when the table is already scoped to one project.
    ...(projectId ? [] : [{ field: 'projectName', header: 'Project', hideOnMobile: true }]),
    { field: 'status', header: 'Status', render: (row) => <StatusChip value={row.status} /> },
    {
      field: 'completionPercentage',
      header: 'Progress',
      render: (row) => (
        <Stack sx={{ minWidth: 90 }}>
          <Typography variant="caption" color="text.secondary">
            {row.completionPercentage}%
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, row.completionPercentage))}
            sx={{ height: 5, borderRadius: 3 }}
          />
        </Stack>
      ),
    },
    {
      field: 'dueDate',
      header: 'Due',
      render: (row) => (
        <Typography variant="body2" color={row.isOverdue ? 'error.main' : 'text.primary'}>
          {formatDate(row.dueDate)}
          {row.isOverdue && ' (overdue)'}
        </Typography>
      ),
    },
    { field: 'assigneeName', header: 'Assignee', hideOnMobile: true },
  ];

  const createButton = (
    <RoleGate action={ACTIONS.MANAGE_DELIVERABLES}>
      <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
        New deliverable
      </Button>
    </RoleGate>
  );

  return (
    <>
      {!embedded && (
        <PageHeader
          title="Deliverables"
          subtitle={`${rows.length} shown`}
          actions={createButton}
        />
      )}

      {embedded && (
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          {createButton}
        </Stack>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={deliverables.loading}
        error={deliverables.error}
        onRetry={deliverables.refresh}
        initialSortBy="dueDate"
        searchPlaceholder="Search deliverables…"
        filters={[
          {
            name: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: DELIVERABLE_STATUS_OPTIONS,
          },
        ]}
        emptyTitle="No deliverables yet"
        emptyDescription="Break the project into deliverables to track progress and dependencies."
        emptyAction={createButton}
        renderRowActions={(row) => (
          <Stack direction="row" spacing={0.5}>
            {/* Employees hold update_deliverables but not manage_deliverables,
                so they can edit progress and never remove the record. */}
            <RoleGate action={ACTIONS.UPDATE_DELIVERABLES} mode="disable">
              <IconButton size="small" aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </RoleGate>
            <RoleGate action={ACTIONS.MANAGE_DELIVERABLES} mode="disable">
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

      <DeliverableForm
        open={formOpen}
        deliverable={editing}
        projects={projects}
        assignees={resources.data ?? []}
        defaultProjectId={projectId ?? ''}
        onSubmit={handleSubmit}
        onClose={() => setFormOpen(false)}
        submitting={submitting}
        serverError={serverError}
      />

      <Dialog
        open={Boolean(deleting)}
        onClose={() => !submitting && setDeleting(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
        <DialogContent>
          {deleting?.assigneeId ? (
            <Typography variant="body2" color="text.secondary">
              This deliverable is assigned to{' '}
              <Typography component="span" variant="body2" fontWeight={700} color="text.primary">
                {deleting.assigneeName}
              </Typography>
              . The assignment won’t be removed silently — hand it to someone else, or unassign and
              delete it.
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Any dependency links to this deliverable are removed with it.
            </Typography>
          )}
          {serverError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {serverError.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap' }}>
          <Button onClick={() => setDeleting(null)} disabled={submitting}>
            Cancel
          </Button>
          {deleting?.assigneeId && (
            <Button onClick={handleReassign} disabled={submitting}>
              Reassign…
            </Button>
          )}
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {deleting?.assigneeId ? 'Unassign & delete' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
