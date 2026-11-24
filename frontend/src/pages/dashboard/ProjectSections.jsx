import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import DueDate from '../../components/DueDate'
import PercentBar from '../../components/PercentBar'
import { EmptyState } from '../../components/StateViews'
import StatusChip from '../../components/StatusChip'
import { budgetColor } from '../../utils/format'
import ProjectHealthChip from '../projects/ProjectHealthChip'
import { budgetUsedLabel, isClosed } from '../projects/projectMetrics'
import { Fact, Facts, ItemHeader, RecordLink } from './DashboardBits'
import DashboardSection, { SectionList } from './DashboardSection'
import { healthBreakdown, joinReasons, projectSubtitle, statusBreakdown } from './dashboardUtils'
import { countLabel } from '../../utils/text'

function ProjectName({ project }) {
  return (
    <RecordLink to={`/projects/${project.id}`} permission="projects:read">
      {project.name}
    </RecordLink>
  )
}

/** The end date and how close it is ("Ends in 5 weeks", "24 days overdue"), against the snapshot's today. */
function EndDate({ project, today }) {
  return <DueDate date={project.end_date} kind="end" today={today} done={isClosed(project.status)} />
}

/**
 * "Which projects are at risk, and why?" - overdue projects first, then by end date (API order).
 * today: the snapshot's date ('YYYY-MM-DD', see snapshotDate) that end dates are worded against.
 */
export function AtRiskProjectsSection({ projects, today }) {
  return (
    <DashboardSection title="Projects at risk" description="Open projects that are overdue or at risk, and why.">
      <SectionList
        items={projects}
        label="Projects at risk"
        emptyTitle="No projects at risk"
        emptyMessage="Every open project is on track."
        renderItem={(project) => <AtRiskProject project={project} today={today} />}
      />
    </DashboardSection>
  )
}

function AtRiskProject({ project, today }) {
  return (
    <>
      <ItemHeader
        title={<ProjectName project={project} />}
        subtitle={projectSubtitle(project)}
        aside={<StatusChip kind="health" value={project.health} />}
      />
      {project.health_reasons?.length > 0 && (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {joinReasons(project.health_reasons)}
        </Typography>
      )}
      <Facts>
        <Fact label="End date">
          <EndDate project={project} today={today} />
        </Fact>
        <Fact label="Progress">
          <PercentBar value={project.progress_percent} />
        </Fact>
      </Facts>
    </>
  )
}

/**
 * Every active project with its health, progress, end date and budget use (earliest end date first).
 * today: the snapshot's date that end dates are worded against.
 */
export function ActiveProjectsSection({ projects, today }) {
  return (
    <DashboardSection
      title="Active projects"
      description="Earliest end date first."
      viewAll={{ to: '/projects', label: 'View all projects', permission: 'projects:read' }}
    >
      <SectionList
        items={projects}
        label="Active projects"
        emptyTitle="No active projects"
        emptyMessage="Projects show here once their status is Active."
        renderItem={(project) => <ActiveProject project={project} today={today} />}
      />
    </DashboardSection>
  )
}

function ActiveProject({ project, today }) {
  const used = project.budget_used_percent
  return (
    <>
      <ItemHeader
        title={<ProjectName project={project} />}
        subtitle={projectSubtitle(project)}
        aside={<ProjectHealthChip health={project.health} reasons={project.health_reasons} />}
      />
      <Facts>
        <Fact label="End date">
          <EndDate project={project} today={today} />
        </Fact>
        <Fact label="Progress">
          <PercentBar value={project.progress_percent} />
        </Fact>
        <Fact label="Budget used">
          <PercentBar value={used} color={budgetColor(used)} label={budgetUsedLabel(used)} />
        </Fact>
      </Facts>
    </>
  )
}

// LinearProgress has no "default" colour; neutral statuses get a grey bar (the text colour).
const barColor = (color) => (color === 'default' ? 'inherit' : color)

/** How many projects are in each status, and the health of the open ones. */
export function ProjectStatusSection({ projects }) {
  const { total = 0, by_status: byStatus, by_health: byHealth } = projects || {}
  return (
    <DashboardSection title="Projects by status" description={`${countLabel(total, 'project')} in total.`}>
      {total ? (
        <>
          <Box component="ul" aria-label="Projects by status" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {statusBreakdown(byStatus, total).map((row) => (
              <Box
                component="li"
                key={row.value}
                sx={{ display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'center', gap: 1.5, py: 0.75 }}
              >
                <span>
                  <StatusChip kind="project" value={row.value} />
                </span>
                <Box sx={{ color: 'text.secondary', minWidth: 0 }}>
                  <PercentBar value={row.percent} color={barColor(row.color)} label={`${row.count} (${row.percent}%)`} />
                </Box>
              </Box>
            ))}
          </Box>
          <Typography variant="subtitle2" component="h3" sx={{ mt: 2, mb: 1 }}>
            Health of open projects
          </Typography>
          <Box component="ul" aria-label="Health of open projects" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {healthBreakdown(byHealth).map((state) => (
              <li key={state.value}>
                <Chip
                  size="small"
                  color={state.color}
                  variant={state.count ? 'filled' : 'outlined'}
                  label={`${state.label}: ${state.count}`}
                />
              </li>
            ))}
          </Box>
        </>
      ) : (
        <EmptyState title="No projects yet" message="Project status and health show here once projects are created." />
      )}
    </DashboardSection>
  )
}
