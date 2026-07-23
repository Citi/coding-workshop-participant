import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import RoleGate from '../components/auth/RoleGate';
import ResourceForm from '../components/resources/ResourceForm';
import AllocationForm from '../components/resources/AllocationForm';
import useApi from '../hooks/useApi';
import useProjects from '../hooks/useProjects';
import {
  createAllocation,
  createResource,
  deleteResource,
  listAllocations,
  listResources,
  updateResource,
} from '../services/resourceService';
import { listDeliverables } from '../services/deliverableService';
import { ACTIONS } from '../utils/constants';

/**
 * People, their capacity, and who is over-allocated.
 *
 * Answers "how are resources allocated across projects?" and "which team
 * members are over-allocated?" -- both read straight off the utilization view,
 * so the figures agree with the reports page rather than being recomputed.
 */
export default function ResourcesPage() {
  const { projects } = useProjects();

  const [formOpen, setFormOpen] = useState(false);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [allocatingFor, setAllocatingFor] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [notice, setNotice] = useState(null);

  const resources = useApi(listResources, { immediate: true, initialData: [] });
  const allocations = useApi(listAllocations, { immediate: true, initialData: [] });
  // Deliverables are assigned to a person (deliverables.assignee_id -> resource),
  // so load them here to show each person's assigned work. Fetched on mount, so
  // creating/editing/reassigning a deliverable is reflected the next time this
  // page loads.
  const deliverables = useApi(listDeliverables, { immediate: true, initialData: [] });

  const rows = resources.data ?? [];
  const overAllocated = rows.filter((row) => row.isOverAllocated);

  // Names of the projects each person is currently on, built from the same
  // active allocations that feed the `projectCount` figure (start_date reached,
  // not yet ended) -- so the names shown always match the count. Deduped by
  // project so two allocations to one project count once.
  const projectsByResource = useMemo(() => {
    const byResource = {};
    for (const alloc of allocations.data ?? []) {
      if (!alloc.isActive) continue;
      (byResource[alloc.resourceId] ??= new Map()).set(alloc.projectId, alloc.projectName);
    }
    return Object.fromEntries(
      Object.entries(byResource).map(([id, projects]) => [id, [...projects.values()]]),
    );
  }, [allocations.data]);

  // Names of the deliverables assigned to each person, keyed by resource id.
  const deliverablesByResource = useMemo(() => {
    const byResource = {};
    for (const deliverable of deliverables.data ?? []) {
      if (!deliverable.assigneeId) continue;
      (byResource[deliverable.assigneeId] ??= []).push(deliverable.name);
    }
    return byResource;
  }, [deliverables.data]);

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

  const openAllocate = (row) => {
    setAllocatingFor(row);
    setServerError(null);
    setNotice(null);
    setAllocationOpen(true);
  };

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    setServerError(null);
    try {
      if (editing) {
        await updateResource(editing.id, payload);
      } else {
        await createResource(payload);
      }
      setFormOpen(false);
      await resources.refresh();
    } catch (caught) {
      setServerError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAllocate = async (payload) => {
    setSubmitting(true);
    setServerError(null);
    try {
      const created = await createAllocation(payload);
      setAllocationOpen(false);
      // The API returns 201 even when the person is now over capacity; the
      // warning it attaches is surfaced here rather than swallowed.
      if (created.overAllocation) setNotice(created.overAllocation.message);
      await Promise.all([resources.refresh(), allocations.refresh()]);
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
      await deleteResource(deleting.id);
      setDeleting(null);
      await Promise.all([resources.refresh(), allocations.refresh()]);
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
          </Typography>
          {row.roleTitle && (
            <Typography variant="caption" color="text.secondary">
              {row.roleTitle}
            </Typography>
          )}
        </Stack>
      ),
    },
    { field: 'email', header: 'Email', hideOnMobile: true },
    {
      field: 'allocatedPct',
      header: 'Utilization',
      // Sort by the real allocated figure, not the rendered node.
      value: (row) => Number(row.allocatedPct ?? 0),
      render: (row) => {
        const allocated = Number(row.allocatedPct ?? 0);
        const capacity = Number(row.capacityPct ?? 100);
        const over = allocated > capacity;
        const note = over
          ? `${allocated - capacity}% over capacity`
          : allocated === capacity
            ? 'Fully booked'
            : `${capacity - allocated}% free`;
        return (
          <Tooltip
            arrow
            title={`Committed to active projects: ${allocated}% of a ${capacity}% capacity. Over 100% means assigned more work than there is capacity for.`}
          >
            <Stack sx={{ minWidth: 132 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color={over ? 'error.main' : 'text.primary'}
                >
                  {allocated}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  of {capacity}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                // Capped so an over-allocation cannot overflow the track; the
                // figures above/below still report the real numbers.
                value={Math.min(100, allocated)}
                color={over ? 'error' : allocated === capacity ? 'warning' : 'primary'}
                sx={{ height: 6, borderRadius: 3, my: 0.25 }}
              />
              <Typography variant="caption" color={over ? 'error.main' : 'text.secondary'}>
                {note}
              </Typography>
            </Stack>
          </Tooltip>
        );
      },
    },
    {
      field: 'projectCount',
      header: 'Projects',
      // Sort by the count; the cell renders the count plus the project names.
      value: (row) => Number(row.projectCount ?? 0),
      render: (row) => {
        const count = Number(row.projectCount ?? 0);
        if (!count) {
          return (
            <Typography variant="caption" color="text.secondary">
              —
            </Typography>
          );
        }
        const names = projectsByResource[row.id] ?? [];
        return (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, maxWidth: 260 }}>
            <Chip label={count} size="small" color="primary" sx={{ fontWeight: 700 }} />
            {names.map((name) => (
              <Chip key={name} label={name} size="small" variant="outlined" />
            ))}
          </Stack>
        );
      },
    },
    {
      field: 'deliverables',
      header: 'Deliverables',
      sortable: false,
      hideOnMobile: true,
      // Which deliverables this person is assigned. Reflects deliverable
      // create/edit/reassign, which the projects (allocation) figures do not.
      render: (row) => {
        const names = deliverablesByResource[row.id] ?? [];
        if (!names.length) {
          return (
            <Typography variant="caption" color="text.secondary">
              —
            </Typography>
          );
        }
        return (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, maxWidth: 240 }}>
            <Chip label={names.length} size="small" color="secondary" sx={{ fontWeight: 700 }} />
            {names.map((name) => (
              <Chip key={name} label={name} size="small" variant="outlined" />
            ))}
          </Stack>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Resources"
        subtitle={`${rows.length} people`}
        actions={
          <RoleGate action={ACTIONS.ASSIGN_EMPLOYEES}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New resource
            </Button>
          </RoleGate>
        }
      />

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        <Box component="strong" sx={{ color: 'text.primary' }}>
          Utilization
        </Box>{' '}
        is how much of a person&apos;s work capacity is booked on active projects — 100% is fully
        booked, and above 100% means they are over-allocated. The Projects column lists which
        projects make up that workload.
      </Typography>

      {notice && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {overAllocated.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {overAllocated.length} {overAllocated.length === 1 ? 'person is' : 'people are'}{' '}
          allocated beyond capacity: {overAllocated.map((r) => r.fullName).join(', ')}.
        </Alert>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={resources.loading}
        error={resources.error}
        onRetry={resources.refresh}
        searchPlaceholder="Search people…"
        emptyTitle="No resources yet"
        emptyDescription="Add the people working on your projects to track allocation and workload."
        renderRowActions={(row) => (
          <Stack direction="row" spacing={0.5}>
            <RoleGate action={ACTIONS.ASSIGN_EMPLOYEES} mode="disable">
              <IconButton
                size="small"
                aria-label={`Allocate ${row.fullName}`}
                onClick={() => openAllocate(row)}
              >
                <PersonAddIcon fontSize="small" />
              </IconButton>
            </RoleGate>
            <RoleGate action={ACTIONS.ASSIGN_EMPLOYEES} mode="disable">
              <IconButton
                size="small"
                aria-label={`Edit ${row.fullName}`}
                onClick={() => openEdit(row)}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </RoleGate>
            <RoleGate action={ACTIONS.ASSIGN_EMPLOYEES} mode="disable">
              <IconButton
                size="small"
                color="error"
                aria-label={`Delete ${row.fullName}`}
                onClick={() => setDeleting(row)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </RoleGate>
          </Stack>
        )}
      />

      <ResourceForm
        open={formOpen}
        resource={editing}
        onSubmit={handleSubmit}
        onClose={() => setFormOpen(false)}
        submitting={submitting}
        serverError={serverError}
      />

      <AllocationForm
        open={allocationOpen}
        resources={rows}
        projects={projects}
        existingAllocations={allocations.data ?? []}
        defaultResourceId={allocatingFor?.id ?? ''}
        onSubmit={handleAllocate}
        onClose={() => setAllocationOpen(false)}
        submitting={submitting}
        serverError={serverError}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Remove ${deleting?.fullName}?`}
        message="Their allocations are removed too. Deliverables assigned to them become unassigned."
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        loading={submitting}
        error={serverError}
      />
    </>
  );
}
