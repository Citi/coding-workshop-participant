import { useCallback, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DataTable from '../../components/DataTable'
import FilterBar from '../../components/FilterBar'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/authContext'
import { useApiQuery } from '../../hooks/useApiQuery'
import { resourcesApi } from '../../services/resourcesApi'
import { useDepartmentOptions } from '../projects/useDepartmentOptions'
import { AllocationTotal, ResourceName } from './ResourceBits'
import ResourceDialogs from './ResourceDialogs'
import { resourceFilters } from './resourceFields'
import { overAllocatedNotice, resourceFiltersFromParams } from './resourceUtils'
import { hasActiveFilters } from '../../utils/filters'

const COLUMNS = [
  { field: 'full_name', header: 'Name', render: (resource) => <ResourceName resource={resource} /> },
  { field: 'email', header: 'Email', hideOnMobile: true },
  { field: 'department', header: 'Department' },
  {
    field: 'total_allocation_percent',
    header: 'Total allocation',
    render: (resource) => <AllocationTotal percent={resource.total_allocation_percent} overAllocated={resource.is_over_allocated} />,
  },
  { field: 'active_project_count', header: 'Active projects', align: 'right', hideOnMobile: true },
]

/**
 * Team members with their total allocation across active projects. Links can preselect filters,
 * e.g. #/resources?over_allocated=true (the dashboard's over-allocation card links here).
 */
export default function ResourcesPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.toString()
  // A new link (e.g. from the dashboard or the menu) starts the list again from its own filters.
  return <ResourceList key={query} initialFilters={resourceFiltersFromParams(searchParams)} />
}

function ResourceList({ initialFilters }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useState(initialFilters)
  const [dialog, setDialog] = useState(null)

  const fetchResources = useCallback(() => resourcesApi.list(filters), [filters])
  const { data, loading, error, reload } = useApiQuery(fetchResources)
  const departmentOptions = useDepartmentOptions(data?.items)
  const filterConfig = useMemo(() => resourceFilters(departmentOptions), [departmentOptions])

  const canCreate = can('resources:create')
  const canUpdate = can('resources:update')
  const canDelete = can('resources:delete')
  const filtered = hasActiveFilters(filters)
  const overAllocatedCount = (data?.items || []).filter((resource) => resource.is_over_allocated).length
  const openCreate = () => setDialog({ mode: 'create' })

  const createButton = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
      New resource
    </Button>
  )

  const renderActions = (resource) => (
    <>
      {canUpdate && (
        <IconButton aria-label={`Edit ${resource.full_name}`} onClick={() => setDialog({ mode: 'edit', resource })}>
          <EditIcon />
        </IconButton>
      )}
      {canDelete && (
        <IconButton aria-label={`Delete ${resource.full_name}`} color="error" onClick={() => setDialog({ mode: 'delete', resource })}>
          <DeleteIcon />
        </IconButton>
      )}
    </>
  )

  return (
    <>
      <PageHeader
        title="Resources"
        subtitle="Team members, their workload across active projects and who is over-allocated"
        actions={canCreate ? createButton : null}
      />
      <FilterBar values={filters} onChange={setFilters} filters={filterConfig} searchPlaceholder="Name, email or job title" />
      {!filters.over_allocated && overAllocatedCount > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => setFilters({ ...filters, over_allocated: true })}>
              Show over-allocated only
            </Button>
          }
        >
          {overAllocatedNotice(overAllocatedCount, filtered)}
        </Alert>
      )}
      <DataTable
        columns={COLUMNS}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(resource) => navigate(`/resources/${resource.id}`)}
        renderActions={canUpdate || canDelete ? renderActions : undefined}
        ariaLabel="Resources"
        emptyTitle={filtered ? 'No matching resources' : 'No resources yet'}
        emptyMessage={emptyMessage(filtered, canCreate)}
        emptyAction={!filtered && canCreate ? createButton : undefined}
      />
      <ResourceDialogs dialog={dialog} onClose={() => setDialog(null)} onSaved={reload} onDeleted={reload} />
    </>
  )
}

function emptyMessage(filtered, canCreate) {
  if (filtered) return 'No team member matches these filters. Try changing or clearing them.'
  return canCreate ? 'Add the first team member to start planning project allocations.' : 'Team members will appear here once they are added.'
}
