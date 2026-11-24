import { useCallback, useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../context/authContext'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useIsMobile } from '../../hooks/useIsMobile'
import { projectsApi } from '../../services/projectsApi'
import ExpensesPanel from '../budget/ExpensesPanel'
import DeliverablesPanel from '../deliverables/DeliverablesPanel'
import AllocationsPanel from '../resources/AllocationsPanel'
import ProjectDialogs from './ProjectDialogs'
import ProjectOverview from './ProjectOverview'
import { parseId } from '../../utils/ids'

const TABS = [
  { value: 'deliverables', label: 'Deliverables' },
  { value: 'team', label: 'Team' },
  { value: 'budget', label: 'Budget' },
]

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export default function ProjectDetailPage() {
  const { projectId } = useParams()
  // Anything but a valid id (e.g. /projects/abc, or one too large to exist) is "not found".
  const id = parseId(projectId)
  if (!id) return <ProjectNotFound />
  // key: opening another project starts from fresh state (no stale data, first tab selected).
  return <ProjectDetail key={id} projectId={id} />
}

function ProjectDetail({ projectId }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [tab, setTab] = useState(TABS[0].value)
  const [dialog, setDialog] = useState(null)
  // Bumped when the project itself is saved: the open tab can show figures that depend on it (e.g. a
  // team member's total only counts active projects), so its panel is mounted again and reloads.
  const [panelKey, setPanelKey] = useState(0)

  const fetchProject = useCallback(() => projectsApi.get(projectId), [projectId])
  const { data: project, loading, error, reload } = useApiQuery(fetchProject)
  const projectSaved = () => {
    reload()
    setPanelKey((key) => key + 1)
  }

  if (error?.status === 404) return <ProjectNotFound />
  if (!project) {
    if (!error) return <LoadingState label="Loading project…" />
    return (
      <>
        <PageHeader title="Project" backTo="/projects" backLabel="All projects" />
        <ErrorState error={error} onRetry={reload} title="Could not load the project" />
      </>
    )
  }

  const actions = [
    can('projects:update') && (
      <Button key="edit" variant="outlined" startIcon={<EditIcon />} onClick={() => setDialog({ mode: 'edit', project })}>
        Edit
      </Button>
    ),
    can('projects:delete') && (
      <Button key="delete" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setDialog({ mode: 'delete', project })}>
        Delete
      </Button>
    ),
  ].filter(Boolean)

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={project.department}
        backTo="/projects"
        backLabel="All projects"
        actions={actions.length ? actions : null}
      />
      <Stack direction="row" useFlexGap spacing={1} sx={{ mt: -1.5, mb: 3, flexWrap: 'wrap' }}>
        <LabelledChip label="Status">
          <StatusChip kind="project" value={project.status} />
        </LabelledChip>
        {project.health && (
          <LabelledChip label="Health">
            <StatusChip kind="health" value={project.health} />
          </LabelledChip>
        )}
      </Stack>

      {error && <ErrorState error={error} onRetry={reload} title="Could not refresh the project" />}
      <Box sx={{ position: 'relative' }}>
        {loading && <LinearProgress aria-label="Refreshing project" sx={{ position: 'absolute', top: -14, left: 0, right: 0 }} />}
        <ProjectOverview project={project} />
      </Box>

      <Box sx={{ mt: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={(_event, value) => setTab(value)}
          aria-label="Project sections"
          variant={isMobile ? 'fullWidth' : 'standard'}
        >
          {TABS.map(({ value, label }) => (
            <Tab key={value} value={value} label={label} id={`project-tab-${value}`} aria-controls={`project-tabpanel-${value}`} />
          ))}
        </Tabs>
      </Box>
      <TabPanel value="deliverables" current={tab}>
        <DeliverablesPanel key={panelKey} projectId={project.id} onChange={reload} />
      </TabPanel>
      <TabPanel value="team" current={tab}>
        <AllocationsPanel key={panelKey} projectId={project.id} onChange={reload} />
      </TabPanel>
      <TabPanel value="budget" current={tab}>
        <ExpensesPanel key={panelKey} projectId={project.id} onChange={reload} />
      </TabPanel>

      <ProjectDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onSaved={projectSaved}
        onDeleted={() => navigate('/projects', { replace: true })}
      />
    </>
  )
}

/** Only the selected panel is mounted, so each section loads its data when it is opened. */
function TabPanel({ value, current, children }) {
  const active = value === current
  return (
    <Box role="tabpanel" id={`project-tabpanel-${value}`} aria-labelledby={`project-tab-${value}`} hidden={!active} sx={{ pt: 2 }}>
      {active && children}
    </Box>
  )
}

/** A chip with a screen-reader prefix ("Status: Active"), since the chip alone has no context. */
function LabelledChip({ label, children }) {
  return (
    <Box sx={{ display: 'inline-flex' }}>
      <Box component="span" sx={VISUALLY_HIDDEN}>
        {label}:{' '}
      </Box>
      {children}
    </Box>
  )
}

function ProjectNotFound() {
  return (
    <EmptyState
      titleComponent="h1"
      title="Project not found"
      message="This project does not exist or has been deleted."
      action={
        <Button component={RouterLink} to="/projects" variant="contained" startIcon={<ArrowBackIcon />}>
          Back to projects
        </Button>
      }
    />
  )
}
