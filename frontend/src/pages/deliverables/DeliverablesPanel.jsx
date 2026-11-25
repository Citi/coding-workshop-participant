import { useCallback, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable from '../../components/DataTable'
import DueDate from '../../components/DueDate'
import FilterBar from '../../components/FilterBar'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../context/authContext'
import { useNotify } from '../../context/notificationContext'
import { useApiQuery } from '../../hooks/useApiQuery'
import { deliverablesApi } from '../../services/deliverablesApi'
import { projectsApi } from '../../services/projectsApi'
import DeliverableDetailsDialog from './DeliverableDetailsDialog'
import DeliverableFormDialog from './DeliverableFormDialog'
import { DeliverableName } from './DeliverableBits'
import { deliverableFilters } from './deliverableFields'
import { hasActiveFilters } from '../../utils/filters'
import { sortLabel } from '../../utils/labels'
import { includeOption } from '../../utils/options'

const CLOSED = { open: false, deliverable: null }

function defaultHeader(actions) {
  return actions ? <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>{actions}</Box> : null
}

function buildColumns(showProject) {
  return [
    { field: 'name', header: 'Deliverable', sortable: true, render: (row) => <DeliverableName deliverable={row} /> },
    ...(showProject ? [{ field: 'project_name', header: 'Project', sortable: true }] : []),
    {
      field: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (row) => sortLabel('deliverable', row.status),
      render: (row) => <StatusChip kind="deliverable" value={row.status} />,
    },
    {
      field: 'due_date',
      header: 'Due date',
      // Sorted by the ISO date itself; the cell adds how close it is ("Due in 3 days", "2 days overdue").
      sortable: true,
      render: (row) => <DueDate date={row.due_date} done={row.status === 'completed'} />,
    },
    {
      field: 'owner_name',
      header: 'Owner',
      // Unassigned deliverables have no owner name, so they sort last.
      sortable: true,
      render: (row) => row.owner_name || <Typography component="span" variant="body2" color="textSecondary">Unassigned</Typography>,
    },
    {
      field: 'depends_on_ids',
      header: 'Depends on',
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (row) => row.depends_on_ids?.length ?? 0,
      render: (row) => row.depends_on_ids?.length ?? 0,
    },
  ]
}

function emptyText(filtered, canCreate) {
  if (filtered) return { title: 'No matching deliverables', message: 'No deliverable matches these filters. Try changing or clearing them.' }
  return {
    title: 'No deliverables yet',
    message: canCreate ? 'Add the first deliverable to start tracking progress.' : 'Deliverables will appear here once they are added.',
  }
}

/** Projects for the filter select (not needed when the panel is fixed to one project). */
function useProjectOptions(enabled) {
  const fetchProjects = useCallback(() => (enabled ? projectsApi.list() : Promise.resolve(null)), [enabled])
  const { data, loading } = useApiQuery(fetchProjects)
  const options = useMemo(() => (data?.items || []).map((project) => ({ value: project.id, label: project.name })), [data])
  return { options, loading }
}

/**
 * Deliverables list + filters + create/edit/delete + dependency chain view.
 * Props: { projectId?: number, onChange?: () => void, initialFilters?, filters?, onFiltersChange?, renderHeader?(actions) }
 *  - projectId: only that project's deliverables; the form's project is fixed to it (a numeric
 *    string from the route works too)
 *  - onChange: called after any successful create/update/delete (parent refreshes metrics)
 *  - initialFilters: starting FilterBar values, e.g. { project_id: 2 }, when the panel keeps its own
 *  - filters + onFiltersChange(next): the parent owns the filters instead (the Deliverables page keeps
 *    them in the URL). Without them, e.g. in a project tab, the filters are the panel's own state and
 *    never touch the URL.
 *  - renderHeader: renders the header around the "New deliverable" button (null without permission)
 */
export default function DeliverablesPanel({
  projectId,
  onChange,
  initialFilters,
  filters: parentFilters,
  onFiltersChange,
  renderHeader = defaultHeader,
}) {
  const { can } = useAuth()
  const notify = useNotify()
  // Route params arrive as strings; option values and payloads use numbers.
  const fixedProjectId = Number(projectId) > 0 ? Number(projectId) : undefined
  const [ownFilters, setOwnFilters] = useState(() => initialFilters || {})
  const filters = parentFilters ?? ownFilters
  const setFilters = onFiltersChange ?? setOwnFilters
  const [form, setForm] = useState(CLOSED)
  const [removal, setRemoval] = useState(CLOSED)
  const [details, setDetails] = useState(CLOSED)

  const query = useMemo(() => (fixedProjectId ? { ...filters, project_id: fixedProjectId } : filters), [filters, fixedProjectId])
  const fetchDeliverables = useCallback(() => deliverablesApi.list(query), [query])
  const { data, loading, error, reload } = useApiQuery(fetchDeliverables)
  const projects = useProjectOptions(!fixedProjectId)

  const canCreate = can('deliverables:create')
  const canUpdate = can('deliverables:update')
  const canDelete = can('deliverables:delete')

  const afterChange = (message) => {
    notify.success(message)
    reload()
    onChange?.()
  }

  const save = async (payload) => {
    if (form.deliverable) await deliverablesApi.update(form.deliverable.id, payload)
    else await deliverablesApi.create(payload)
    setForm((current) => ({ ...current, open: false }))
    afterChange(form.deliverable ? 'Deliverable updated' : 'Deliverable created')
  }

  const remove = async () => {
    await deliverablesApi.remove(removal.deliverable.id)
    setRemoval((current) => ({ ...current, open: false }))
    afterChange('Deliverable deleted')
  }

  const projectFilterOptions = fixedProjectId
    ? undefined
    : includeOption(projects.options, filters.project_id, projects.loading ? 'Loading…' : `Project #${filters.project_id}`)

  const createButton = canCreate ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ open: true, deliverable: null })}>
      New deliverable
    </Button>
  ) : null

  const renderActions =
    canUpdate || canDelete
      ? (row) => (
          <>
            {canUpdate && (
              <IconButton aria-label={`Edit ${row.name}`} onClick={() => setForm({ open: true, deliverable: row })}>
                <EditIcon />
              </IconButton>
            )}
            {canDelete && (
              <IconButton aria-label={`Delete ${row.name}`} color="error" onClick={() => setRemoval({ open: true, deliverable: row })}>
                <DeleteIcon />
              </IconButton>
            )}
          </>
        )
      : undefined

  const filtered = hasActiveFilters(filters)
  const empty = emptyText(filtered, canCreate)
  // Like the other top-level lists (Projects, Resources), the all-projects page invites the first
  // deliverable in its empty state; inside a project tab the New button sits right above the list.
  const emptyAction = !fixedProjectId && !filtered ? createButton : null

  return (
    <Box>
      {renderHeader(createButton)}
      <FilterBar
        values={filters}
        onChange={setFilters}
        filters={deliverableFilters({ projectOptions: projectFilterOptions })}
        searchPlaceholder="Name or description"
      />
      <DataTable
        columns={buildColumns(!fixedProjectId)}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Could not load the deliverables"
        refreshErrorTitle="Could not refresh the deliverables"
        onRowClick={(row) => setDetails({ open: true, deliverable: row })}
        renderActions={renderActions}
        emptyTitle={empty.title}
        emptyMessage={empty.message}
        emptyAction={emptyAction}
        ariaLabel="Deliverables"
      />
      <DeliverableFormDialog
        open={form.open}
        deliverable={form.deliverable}
        projectId={fixedProjectId}
        defaultProjectId={filters.project_id}
        onClose={() => setForm((current) => ({ ...current, open: false }))}
        onSubmit={save}
      />
      <ConfirmDialog
        open={removal.open}
        title="Delete deliverable?"
        message={
          removal.deliverable
            ? `"${removal.deliverable.name}" will be permanently deleted. Deliverables that depend on it will lose this ` +
              'prerequisite. This cannot be undone.'
            : ''
        }
        confirmLabel="Delete deliverable"
        onConfirm={remove}
        onClose={() => setRemoval((current) => ({ ...current, open: false }))}
      />
      <DeliverableDetailsDialog
        open={details.open}
        deliverable={details.deliverable}
        onClose={() => setDetails((current) => ({ ...current, open: false }))}
      />
    </Box>
  )
}
