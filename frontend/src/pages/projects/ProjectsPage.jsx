import { useCallback, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ViewListIcon from '@mui/icons-material/ViewList'
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'
import DataTable from '../../components/DataTable'
import DueDate from '../../components/DueDate'
import FilterBar from '../../components/FilterBar'
import PageHeader from '../../components/PageHeader'
import PercentBar from '../../components/PercentBar'
import { ErrorState, LoadingState } from '../../components/StateViews'
import StatusChip from '../../components/StatusChip'
import ViewSwitch, { useViewParam } from '../../components/ViewSwitch'
import { useAuth } from '../../context/authContext'
import { useApiQuery } from '../../hooks/useApiQuery'
import { textParam, useUrlFilters } from '../../hooks/useUrlFilters'
import { projectsApi } from '../../services/projectsApi'
import { budgetColor, formatCurrency } from '../../utils/format'
import { HEALTH_FILTER_OPTIONS, HEALTH_STATES, healthRank, optionsFor, PROJECT_STATUSES, sortLabel } from '../../utils/labels'
import { includeTextOption } from '../../utils/options'
import ProjectDialogs from './ProjectDialogs'
import ProjectHealthChip from './ProjectHealthChip'
import { budgetUsedLabel, isClosed } from './projectMetrics'
import ProjectTimeline from './ProjectTimeline'
import { useDepartmentOptions } from './useDepartmentOptions'

const COLUMNS = [
  { field: 'name', header: 'Project', sortable: true, render: (project) => <ProjectName project={project} /> },
  {
    field: 'status',
    header: 'Status',
    sortable: true,
    sortValue: (project) => sortLabel('project', project.status),
    render: (project) => <StatusChip kind="project" value={project.status} />,
  },
  {
    field: 'health',
    header: 'Health',
    // Most severe first (overdue, at risk, on track); projects without health come last.
    sortable: true,
    sortValue: (project) => healthRank(project.health),
    render: (project) => <ProjectHealthChip health={project.health} reasons={project.health_reasons} />,
  },
  { field: 'progress_percent', header: 'Progress', sortable: true, render: (project) => <PercentBar value={project.progress_percent} compact /> },
  {
    field: 'end_date',
    header: 'End date',
    // Sorted by the ISO date itself; completed and cancelled projects show the date without urgency.
    sortable: true,
    render: (project) => <DueDate date={project.end_date} kind="end" done={isClosed(project.status)} />,
  },
  {
    field: 'budget_used_percent',
    header: 'Budget used',
    // null means money was spent against a zero budget: the highest share used (as on the dashboard).
    sortable: true,
    sortValue: (project) => project.budget_used_percent ?? Infinity,
    render: (project) => <BudgetUsage project={project} />,
  },
  { field: 'team_size', header: 'Team size', align: 'right', hideOnMobile: true, sortable: true },
]

const STATUS_OPTIONS = optionsFor('project')
/** What failed, in both views (DataTable and TimelineView take the same props). */
const ERROR_TITLES = { errorTitle: 'Could not load the projects', refreshErrorTitle: 'Could not refresh the projects' }

/** The list is the default view (no parameter); ?view=timeline shows every project's dates on one time axis. */
const VIEW_OPTIONS = [
  { value: 'list', label: 'List', icon: <ViewListIcon /> },
  { value: 'timeline', label: 'Timeline', icon: <ViewTimelineIcon /> },
]
const VIEWS = VIEW_OPTIONS.map((option) => option.value)

/** URL parameters of the filters; any other parameter (e.g. view=timeline) is kept as it is. */
const URL_FILTERS = ['search', 'status', 'health', 'department']
const STATUS_VALUES = new Set(PROJECT_STATUSES.map((status) => status.value))
const HEALTH_ORDER = HEALTH_STATES.map((state) => state.value)
const HEALTH_FILTER_VALUES = new Set(HEALTH_FILTER_OPTIONS.map((option) => option.value))
// The API rejects a longer department filter with 400.
const DEPARTMENT_MAX_LENGTH = 100

/** Health from the URL: one state, or a combination the select offers listed in any order ("overdue,at_risk"). */
function healthFromParams(params) {
  const listed = (params.get('health') || '').split(',').map((value) => value.trim())
  const value = HEALTH_ORDER.filter((state) => listed.includes(state)).join(',')
  return listed.every((state) => HEALTH_ORDER.includes(state)) && HEALTH_FILTER_VALUES.has(value) ? value : undefined
}

/** The filters in the page URL, e.g. #/projects?status=active&health=at_risk,overdue. Invalid values are ignored. */
function projectFiltersFromParams(params) {
  const filters = {}
  const search = textParam(params, 'search')
  if (search) filters.search = search
  const status = params.get('status')
  if (STATUS_VALUES.has(status)) filters.status = status
  const health = healthFromParams(params)
  if (health) filters.health = health
  const department = textParam(params, 'department', DEPARTMENT_MAX_LENGTH)
  if (department) filters.department = department
  return filters
}

/**
 * Every project with its status, health, progress and budget, as a list or as a timeline of their
 * dates (#/projects?view=timeline). The filters and the view live in the URL, so a reload, Back
 * from a project page and shared links keep them, and links (e.g. the dashboard's
 * ?health=at_risk,overdue) or the menu change them. Both views show the same filtered projects, so
 * switching keeps the filters and loads nothing again.
 */
export default function ProjectsPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useUrlFilters(projectFiltersFromParams, URL_FILTERS)
  const view = useViewParam(VIEWS)
  const [dialog, setDialog] = useState(null)

  const fetchProjects = useCallback(() => projectsApi.list(filters), [filters])
  const { data, loading, error, reload } = useApiQuery(fetchProjects)
  const departmentOptions = useDepartmentOptions(data?.items)

  const filterConfig = useMemo(
    () => [
      { name: 'status', label: 'Status', options: STATUS_OPTIONS },
      { name: 'health', label: 'Health', options: HEALTH_FILTER_OPTIONS },
      // A department from a link is selectable before (or without) its projects loading, under its
      // own name; one that differs only in case selects the loaded department ('digital': Digital).
      { name: 'department', label: 'Department', options: includeTextOption(departmentOptions, filters.department) },
    ],
    [departmentOptions, filters.department],
  )

  const canCreate = can('projects:create')
  const canUpdate = can('projects:update')
  const canDelete = can('projects:delete')
  const filtered = Object.values(filters).some((value) => value !== undefined && value !== '')
  const openCreate = () => setDialog({ mode: 'create' })

  const createButton = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
      New project
    </Button>
  )
  // The same empty state in both views.
  const empty = {
    emptyTitle: filtered ? 'No matching projects' : 'No projects yet',
    emptyMessage: emptyMessage(filtered, canCreate),
    emptyAction: !filtered && canCreate ? createButton : undefined,
  }

  const renderActions = (project) => (
    <>
      {canUpdate && (
        <IconButton aria-label={`Edit ${project.name}`} onClick={() => setDialog({ mode: 'edit', project })}>
          <EditIcon />
        </IconButton>
      )}
      {canDelete && (
        <IconButton aria-label={`Delete ${project.name}`} color="error" onClick={() => setDialog({ mode: 'delete', project })}>
          <DeleteIcon />
        </IconButton>
      )}
    </>
  )

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Status, health, progress and budget of every project"
        actions={canCreate ? createButton : null}
      />
      {/* Its own row above the filters, which apply to both views: it never crowds the header. */}
      <Box sx={{ display: 'flex', mb: 2 }}>
        <ViewSwitch options={VIEW_OPTIONS} />
      </Box>
      <FilterBar
        values={filters}
        onChange={setFilters}
        filters={filterConfig}
        searchPlaceholder="Name, description or department"
      />
      {view === 'timeline' ? (
        <TimelineView projects={data?.items} loading={loading} error={error} onRetry={reload} {...ERROR_TITLES} {...empty} />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          onRowClick={(project) => navigate(`/projects/${project.id}`)}
          renderActions={canUpdate || canDelete ? renderActions : undefined}
          ariaLabel="Projects"
          {...ERROR_TITLES}
          {...empty}
        />
      )}
      <ProjectDialogs dialog={dialog} onClose={() => setDialog(null)} onSaved={reload} onDeleted={reload} />
    </>
  )
}

function emptyMessage(filtered, canCreate) {
  if (filtered) return 'No project matches these filters. Try changing or clearing them.'
  return canCreate ? 'Create the first project to start tracking its progress.' : 'Projects will appear here once they are created.'
}

/**
 * The timeline view. ProjectTimeline leaves loading and errors to the page, so they look here as
 * DataTable shows them in the list: a spinner, or the error with Retry, until there are projects to
 * show; then a refresh error or a thin "Refreshing" bar above the projects still on screen.
 */
function TimelineView({ projects, loading, error, onRetry, errorTitle, refreshErrorTitle, ...empty }) {
  const shown = Boolean(projects?.length)
  if (error && !shown) return <ErrorState error={error} onRetry={onRetry} title={errorTitle} />
  if (loading && !shown) return <LoadingState />
  return (
    <Box>
      {error && <ErrorState error={error} onRetry={onRetry} title={refreshErrorTitle} />}
      {loading && <LinearProgress sx={{ mb: 1 }} aria-label="Refreshing" />}
      {/* emptyTitle, emptyMessage and emptyAction: the list's empty state. */}
      <ProjectTimeline projects={projects} {...empty} />
    </Box>
  )
}

/**
 * Name and department. overflow-wrap: break-word, unlike word-break: break-word (or overflow-wrap:
 * anywhere), does not let a squeezed table make the column narrower than its longest word, so
 * "Decommission" never breaks mid-word; only a single word too long for a phone's card is split.
 */
const nameStyle = { display: 'block', fontWeight: 600, overflowWrap: 'break-word' }

function ProjectName({ project }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box component="span" sx={nameStyle}>
        {project.name}
      </Box>
      <Typography component="span" variant="body2" color="textSecondary" sx={{ display: 'block' }}>
        {project.department}
      </Typography>
    </Box>
  )
}

function BudgetUsage({ project }) {
  const percent = project.budget_used_percent
  return (
    <Box>
      <PercentBar value={percent} color={budgetColor(percent)} label={budgetUsedLabel(percent)} compact />
      <Typography variant="caption" color="textSecondary">
        {formatCurrency(project.budget_spent, { whole: true })} of {formatCurrency(project.budget, { whole: true })}
      </Typography>
    </Box>
  )
}
