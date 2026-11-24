import { useCallback, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable from '../../components/DataTable'
import PercentBar from '../../components/PercentBar'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../context/authContext'
import { useNotify } from '../../context/notificationContext'
import { useApiQuery } from '../../hooks/useApiQuery'
import { allocationsApi } from '../../services/allocationsApi'
import AllocationFormDialog from './AllocationFormDialog'
import { allocationLabel, allocationQuery, deleteAllocationMessage, toAllocationPayload } from './allocationFields'
import { AllocationTotal } from './ResourceBits'
import { overAllocationWarning } from './resourceUtils'
import { parseId } from '../../utils/ids'
import { sortLabel } from '../../utils/labels'

const CLOSED = { open: false, allocation: null }

/**
 * Columns adapt to the context: a project's team does not repeat the project, and one person's
 * list does not repeat their own total (the detail page shows it in the utilization card).
 */
function buildColumns({ showResource, showProject }) {
  const resourceColumns = [
    {
      field: 'resource_name',
      header: 'Team member',
      sortable: true,
      render: (row) => (
        <Link component={RouterLink} to={`/resources/${row.resource_id}`}>
          {row.resource_name}
        </Link>
      ),
    },
  ]
  const projectColumns = [
    {
      field: 'project_name',
      header: 'Project',
      sortable: true,
      render: (row) => (
        <Link component={RouterLink} to={`/projects/${row.project_id}`}>
          {row.project_name}
        </Link>
      ),
    },
    {
      field: 'project_status',
      header: 'Project status',
      sortable: true,
      sortValue: (row) => sortLabel('project', row.project_status),
      render: (row) => <StatusChip kind="project" value={row.project_status} />,
    },
  ]
  const totalColumns = [
    {
      field: 'resource_total_allocation_percent',
      header: 'Total allocation',
      sortable: true,
      render: (row) => <AllocationTotal percent={row.resource_total_allocation_percent} overAllocated={row.resource_over_allocated} />,
    },
  ]
  return [
    ...(showResource ? resourceColumns : []),
    ...(showProject ? projectColumns : []),
    { field: 'allocation_percent', header: 'Allocation', sortable: true, render: (row) => <PercentBar value={row.allocation_percent} /> },
    ...(showResource ? totalColumns : []),
  ]
}

/** Table name and empty-state text for the context the panel is shown in (flags: a fixed project / person). */
function contextText({ forProject, forResource }, canCreate) {
  if (forProject) {
    return {
      tableLabel: 'Team allocations',
      title: 'No team members yet',
      message: canCreate ? 'Allocate people to this project to build its team.' : 'Team members will appear here once they are allocated.',
    }
  }
  if (forResource) {
    return {
      tableLabel: 'Project allocations',
      title: 'No project allocations yet',
      message: canCreate ? 'Allocate this person to a project to plan their workload.' : 'Projects this person works on will appear here.',
    }
  }
  return {
    tableLabel: 'Allocations',
    title: 'No allocations yet',
    message: canCreate ? 'Allocate a team member to a project to get started.' : 'Allocations will appear here once they are created.',
  }
}

/**
 * Allocations (resource <-> project, %) list + create/edit/delete.
 * Props: { projectId?: number, resourceId?: number, onChange?: () => void, title?: string }
 *  - projectId: the project's team (form picks a resource); resourceId: the person's projects
 *    (numeric strings from a route work too)
 *  - onChange: called after any successful create/update/delete (parent refreshes its totals)
 *  - title: optional section heading shown next to the "New allocation" button
 */
export default function AllocationsPanel({ projectId, resourceId, onChange, title }) {
  const { can } = useAuth()
  const notify = useNotify()
  // Route params arrive as strings; queries, option values and payloads use numbers.
  const fixedProjectId = parseId(projectId)
  const fixedResourceId = parseId(resourceId)
  const [form, setForm] = useState(CLOSED)
  const [removal, setRemoval] = useState(CLOSED)

  const fetchAllocations = useCallback(
    () => allocationsApi.list(allocationQuery({ projectId: fixedProjectId, resourceId: fixedResourceId })),
    [fixedProjectId, fixedResourceId],
  )
  const { data, loading, error, reload } = useApiQuery(fetchAllocations)

  const canCreate = can('allocations:create')
  const canUpdate = can('allocations:update')
  const canDelete = can('allocations:delete')
  const showResource = !fixedResourceId

  const afterChange = () => {
    reload()
    onChange?.()
  }

  const save = async (values) => {
    const editing = Boolean(form.allocation)
    const payload = toAllocationPayload(values)
    const saved = editing ? await allocationsApi.update(form.allocation.id, payload) : await allocationsApi.create(payload)
    setForm(CLOSED)
    const done = editing ? 'Allocation updated' : 'Allocation created'
    // Over-allocation is allowed but must not go unnoticed. Only one toast shows at a time,
    // so the warning carries the success message as well.
    if (saved?.resource_over_allocated) notify.warning(`${done}. ${overAllocationWarning(saved)}`)
    else notify.success(done)
    afterChange()
  }

  const remove = async () => {
    await allocationsApi.remove(removal.allocation.id)
    setRemoval(CLOSED)
    notify.success('Allocation deleted')
    afterChange()
  }

  const renderActions =
    canUpdate || canDelete
      ? (row) => (
          <>
            {canUpdate && (
              <IconButton aria-label={`Edit allocation for ${allocationLabel(row)}`} onClick={() => setForm({ open: true, allocation: row })}>
                <EditIcon />
              </IconButton>
            )}
            {canDelete && (
              <IconButton
                aria-label={`Delete allocation for ${allocationLabel(row)}`}
                color="error"
                onClick={() => setRemoval({ open: true, allocation: row })}
              >
                <DeleteIcon />
              </IconButton>
            )}
          </>
        )
      : undefined

  const copy = contextText({ forProject: Boolean(fixedProjectId), forResource: Boolean(fixedResourceId) }, canCreate)
  const rows = data?.items

  return (
    <Box>
      {(title || canCreate) && (
        <Stack
          direction="row"
          useFlexGap
          spacing={1}
          sx={{ justifyContent: title ? 'space-between' : 'flex-end', alignItems: 'center', flexWrap: 'wrap', mb: 2 }}
        >
          {title && (
            <Typography variant="h6" component="h2">
              {title}
            </Typography>
          )}
          {canCreate && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ open: true, allocation: null })}>
              New allocation
            </Button>
          )}
        </Stack>
      )}
      <DataTable
        columns={buildColumns({ showResource, showProject: !fixedProjectId })}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Could not load the allocations"
        refreshErrorTitle="Could not refresh the allocations"
        renderActions={renderActions}
        ariaLabel={copy.tableLabel}
        emptyTitle={copy.title}
        emptyMessage={copy.message}
      />
      {showResource && rows?.length > 0 && (
        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
          Total allocation is each person&apos;s sum across all active projects; above 100% they are over-allocated.
        </Typography>
      )}
      <AllocationFormDialog
        open={form.open}
        allocation={form.allocation}
        resourceId={fixedResourceId}
        projectId={fixedProjectId}
        existing={rows}
        onClose={() => setForm(CLOSED)}
        onSubmit={save}
      />
      <ConfirmDialog
        open={removal.open}
        onClose={() => setRemoval(CLOSED)}
        title="Delete allocation?"
        message={removal.allocation ? deleteAllocationMessage(removal.allocation) : ''}
        confirmLabel="Delete allocation"
        onConfirm={remove}
      />
    </Box>
  )
}
