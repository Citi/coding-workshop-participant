import { useCallback, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import GridOnIcon from '@mui/icons-material/GridOn'
import ViewListIcon from '@mui/icons-material/ViewList'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import { useNavigate } from 'react-router-dom'
import DataTable from '../../components/DataTable'
import FilterBar from '../../components/FilterBar'
import PageHeader from '../../components/PageHeader'
import ViewSwitch, { useViewParam } from '../../components/ViewSwitch'
import { useAuth } from '../../context/authContext'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useUrlFilters } from '../../hooks/useUrlFilters'
import { resourcesApi } from '../../services/resourcesApi'
import { useDepartmentOptions } from '../projects/useDepartmentOptions'
import AllocationHeatmap from './AllocationHeatmap'
import { AllocationTotal, ResourceName } from './ResourceBits'
import ResourceDialogs from './ResourceDialogs'
import { resourceFilters } from './resourceFields'
import { overAllocatedNotice, RESOURCE_URL_FILTERS, resourceFiltersFromParams } from './resourceUtils'
import { hasActiveFilters } from '../../utils/filters'
import { includeTextOption } from '../../utils/options'

const COLUMNS = [
  { field: 'full_name', header: 'Name', sortable: true, render: (resource) => <ResourceName resource={resource} /> },
  { field: 'email', header: 'Email', hideOnMobile: true, sortable: true },
  { field: 'department', header: 'Department', sortable: true },
  {
    field: 'total_allocation_percent',
    header: 'Total allocation',
    sortable: true,
    render: (resource) => <AllocationTotal percent={resource.total_allocation_percent} overAllocated={resource.is_over_allocated} />,
  },
  { field: 'active_project_count', header: 'Active projects', align: 'right', hideOnMobile: true, sortable: true },
]

/**
 * The over-allocation call-out: on phones its long action goes under the message (the message needs
 * 16rem beside the icon) instead of squeezing "Show over-allocated only" onto four lines; wider
 * screens keep message and action on one line.
 */
const calloutStyle = { mb: 2, flexWrap: 'wrap', '& .MuiAlert-message': { flexGrow: 1, flexShrink: 1, flexBasis: '16rem' } }

/** The list is the default view (no parameter); ?view=heatmap shows who works on which project. */
const VIEW_OPTIONS = [
  { value: 'list', label: 'List', icon: <ViewListIcon /> },
  { value: 'heatmap', label: 'Heat map', icon: <GridOnIcon /> },
]
const VIEWS = VIEW_OPTIONS.map((option) => option.value)

/**
 * Team members with their total allocation across active projects, as a list or as a heat map of
 * their allocations per project (#/resources?view=heatmap). The filters live in the URL, e.g.
 * #/resources?over_allocated=true (the dashboard's over-allocation card links here): a reload,
 * Back and shared links keep them, and a new link (the menu, the dashboard) or Back/Forward
 * changes them. Both views show the same filtered people, from one GET /resources, so switching
 * keeps the filters and loads no one again (the heat map adds everyone's allocations).
 */
export default function ResourcesPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useUrlFilters(resourceFiltersFromParams, RESOURCE_URL_FILTERS)
  const view = useViewParam(VIEWS)
  const [dialog, setDialog] = useState(null)
  // A new key mounts the heat map again, so it loads the allocations afresh.
  const [heatmapKey, setHeatmapKey] = useState(0)

  // The people of both views, loaded once for either: the list's rows and the heat map's people,
  // the department options and the over-allocation call-out (the heat map adds the allocations).
  const fetchResources = useCallback(() => resourcesApi.list(filters), [filters])
  const { data, loading, error, reload } = useApiQuery(fetchResources)
  const departmentOptions = useDepartmentOptions(data?.items)
  // A department from a link is selectable before (or without) the people of that department
  // loading, under its own name; one that differs only in case selects the loaded department.
  const filterConfig = useMemo(
    () => resourceFilters(includeTextOption(departmentOptions, filters.department)),
    [departmentOptions, filters.department],
  )

  const canCreate = can('resources:create')
  const canUpdate = can('resources:update')
  const canDelete = can('resources:delete')
  const filtered = hasActiveFilters(filters)
  const overAllocatedCount = (data?.items || []).filter((resource) => resource.is_over_allocated).length
  const openCreate = () => setDialog({ mode: 'create' })
  /** After a create, edit or delete: both views show the change. */
  const refresh = () => {
    reload()
    setHeatmapKey((key) => key + 1)
  }

  const createButton = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
      New resource
    </Button>
  )
  // The same empty state in both views.
  const empty = {
    emptyTitle: filtered ? 'No matching resources' : 'No resources yet',
    emptyMessage: emptyMessage(filtered, canCreate),
    emptyAction: !filtered && canCreate ? createButton : undefined,
  }

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
      {/* Its own row above the filters, which apply to both views: it never crowds the header. */}
      <Box sx={{ display: 'flex', mb: 2 }}>
        <ViewSwitch options={VIEW_OPTIONS} />
      </Box>
      <FilterBar values={filters} onChange={setFilters} filters={filterConfig} searchPlaceholder="Name, email or job title" />
      {!filters.over_allocated && overAllocatedCount > 0 && (
        <Alert
          severity="warning"
          sx={calloutStyle}
          action={
            <Button color="inherit" size="small" onClick={() => setFilters({ ...filters, over_allocated: true })}>
              Show over-allocated only
            </Button>
          }
        >
          {overAllocatedNotice(overAllocatedCount, filtered)}
        </Alert>
      )}
      {view === 'heatmap' ? (
        // The page's people, with their loading and errors (one GET /resources for the whole page).
        <AllocationHeatmap
          key={heatmapKey}
          filters={filters}
          resources={data?.items}
          resourcesLoading={loading}
          resourcesError={error}
          onRetry={reload}
          {...empty}
        />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          onRowClick={(resource) => navigate(`/resources/${resource.id}`)}
          renderActions={canUpdate || canDelete ? renderActions : undefined}
          ariaLabel="Resources"
          errorTitle="Could not load the team members"
          refreshErrorTitle="Could not refresh the team members"
          {...empty}
        />
      )}
      <ResourceDialogs dialog={dialog} onClose={() => setDialog(null)} onSaved={refresh} onDeleted={refresh} />
    </>
  )
}

function emptyMessage(filtered, canCreate) {
  if (filtered) return 'No team member matches these filters. Try changing or clearing them.'
  return canCreate ? 'Add the first team member to start planning project allocations.' : 'Team members will appear here once they are added.'
}
