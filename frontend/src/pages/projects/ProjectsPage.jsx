import { useCallback, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'
import DataTable from '../../components/DataTable'
import FilterBar from '../../components/FilterBar'
import PageHeader from '../../components/PageHeader'
import PercentBar from '../../components/PercentBar'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../context/authContext'
import { useApiQuery } from '../../hooks/useApiQuery'
import { projectsApi } from '../../services/projectsApi'
import { budgetColor, formatCurrency, formatDate } from '../../utils/format'
import { optionsFor } from '../../utils/labels'
import ProjectDialogs from './ProjectDialogs'
import ProjectHealthChip from './ProjectHealthChip'
import { budgetUsedLabel } from './projectMetrics'
import { useDepartmentOptions } from './useDepartmentOptions'

const COLUMNS = [
  { field: 'name', header: 'Project', render: (project) => <ProjectName project={project} /> },
  { field: 'status', header: 'Status', render: (project) => <StatusChip kind="project" value={project.status} /> },
  {
    field: 'health',
    header: 'Health',
    render: (project) => <ProjectHealthChip health={project.health} reasons={project.health_reasons} />,
  },
  { field: 'progress_percent', header: 'Progress', render: (project) => <PercentBar value={project.progress_percent} /> },
  { field: 'end_date', header: 'End date', render: (project) => formatDate(project.end_date) },
  { field: 'budget_used_percent', header: 'Budget used', render: (project) => <BudgetUsage project={project} /> },
  { field: 'team_size', header: 'Team size', align: 'right', hideOnMobile: true },
]

const STATUS_OPTIONS = optionsFor('project')
const HEALTH_OPTIONS = optionsFor('health')

export default function ProjectsPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useState({})
  const [dialog, setDialog] = useState(null)

  const fetchProjects = useCallback(() => projectsApi.list(filters), [filters])
  const { data, loading, error, reload } = useApiQuery(fetchProjects)
  const departmentOptions = useDepartmentOptions(data?.items)

  const filterConfig = useMemo(
    () => [
      { name: 'status', label: 'Status', options: STATUS_OPTIONS },
      { name: 'health', label: 'Health', options: HEALTH_OPTIONS },
      { name: 'department', label: 'Department', options: departmentOptions },
    ],
    [departmentOptions],
  )

  const canCreate = can('projects:create')
  const canUpdate = can('projects:update')
  const canDelete = can('projects:delete')
  const filtered = Object.values(filters).some((value) => value !== undefined && value !== '')
  const openCreate = () => setDialog({ mode: 'create' })

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
        actions={
          canCreate ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New project
            </Button>
          ) : null
        }
      />
      <FilterBar
        values={filters}
        onChange={setFilters}
        filters={filterConfig}
        searchPlaceholder="Name, description or department"
      />
      <DataTable
        columns={COLUMNS}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(project) => navigate(`/projects/${project.id}`)}
        renderActions={canUpdate || canDelete ? renderActions : undefined}
        ariaLabel="Projects"
        emptyTitle={filtered ? 'No matching projects' : 'No projects yet'}
        emptyMessage={emptyMessage(filtered, canCreate)}
        emptyAction={
          !filtered && canCreate ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New project
            </Button>
          ) : undefined
        }
      />
      <ProjectDialogs dialog={dialog} onClose={() => setDialog(null)} onSaved={reload} onDeleted={reload} />
    </>
  )
}

function emptyMessage(filtered, canCreate) {
  if (filtered) return 'No project matches these filters. Try changing or clearing them.'
  return canCreate ? 'Create the first project to start tracking its progress.' : 'Projects will appear here once they are created.'
}

function ProjectName({ project }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box component="span" sx={{ display: 'block', fontWeight: 600, wordBreak: 'break-word' }}>
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
      <PercentBar value={percent} color={budgetColor(percent)} label={budgetUsedLabel(percent)} />
      <Typography variant="caption" color="textSecondary">
        {formatCurrency(project.budget_spent, { whole: true })} of {formatCurrency(project.budget, { whole: true })}
      </Typography>
    </Box>
  )
}
