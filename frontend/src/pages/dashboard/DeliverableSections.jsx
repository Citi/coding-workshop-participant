import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import PercentBar from '../../components/PercentBar'
import StatusChip from '../../components/StatusChip'
import { formatDate } from '../../utils/format'
import { KeyBadge } from '../deliverables/DeliverableBits'
import { completionPercent } from '../projects/projectMetrics'
import { ItemHeader, RecordLink } from './DashboardBits'
import DashboardSection, { SectionList } from './DashboardSection'
import { relativeDue } from './dashboardUtils'

/**
 * Key deliverables and their completion status: how many are done, then the open ones by due date.
 * totals: the dashboard's `deliverables` counters.
 */
export function KeyDeliverablesSection({ deliverables, totals = {}, today }) {
  const { key_total: total = 0, key_completed: completed = 0 } = totals
  return (
    <DashboardSection
      title="Key deliverables"
      description="Open key deliverables, earliest due date first."
      viewAll={{ to: '/deliverables?is_key=true', label: 'View all key deliverables', permission: 'deliverables:read' }}
    >
      {total > 0 && (
        <Box sx={{ mb: 1 }}>
          <PercentBar value={completionPercent(completed, total)} color="success" label={`${completed} of ${total} completed`} />
        </Box>
      )}
      <SectionList
        items={deliverables}
        label="Open key deliverables"
        emptyTitle="No open key deliverables"
        emptyMessage={total ? 'Every key deliverable is completed.' : 'Mark the most important deliverables as key to follow them here.'}
        renderItem={(deliverable) => <DeliverableItem deliverable={deliverable} today={today} />}
      />
    </DashboardSection>
  )
}

/** Open deliverables past their due date (the API sends the 10 that are most overdue). */
export function OverdueDeliverablesSection({ deliverables, today }) {
  return (
    <DashboardSection
      title="Overdue deliverables"
      description="Open deliverables past their due date, most overdue first."
      viewAll={{ to: '/deliverables?overdue=true', label: 'View all overdue deliverables', permission: 'deliverables:read' }}
    >
      <SectionList
        items={deliverables}
        label="Overdue deliverables"
        emptyTitle="Nothing overdue"
        emptyMessage="No open deliverable is past its due date."
        renderItem={(deliverable) => <DeliverableItem deliverable={deliverable} today={today} showKeyBadge />}
      />
    </DashboardSection>
  )
}

/** Open deliverables due from today up to 14 days ahead. */
export function UpcomingDeliverablesSection({ deliverables, today }) {
  return (
    <DashboardSection
      title="Upcoming (next 14 days)"
      description="Open deliverables due from today up to 14 days ahead."
      viewAll={{ to: '/deliverables', label: 'View all deliverables', permission: 'deliverables:read' }}
    >
      <SectionList
        items={deliverables}
        label="Upcoming deliverables"
        emptyTitle="Nothing due soon"
        emptyMessage="No open deliverable is due in the next 14 days."
        renderItem={(deliverable) => <DeliverableItem deliverable={deliverable} today={today} showKeyBadge />}
      />
    </DashboardSection>
  )
}

/** Name (with the key badge), status, project, owner and due date of one DeliverableSummary. */
function DeliverableItem({ deliverable, today, showKeyBadge = false }) {
  return (
    <>
      <ItemHeader
        title={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <span>{deliverable.name}</span>
            {showKeyBadge && deliverable.is_key && <KeyBadge />}
          </Box>
        }
        subtitle={
          <>
            <RecordLink to={`/projects/${deliverable.project_id}`} permission="projects:read" strong={false}>
              {deliverable.project_name}
            </RecordLink>
            {' · '}
            {deliverable.owner_name ? `Owner: ${deliverable.owner_name}` : 'No owner'}
          </>
        }
        aside={<StatusChip kind="deliverable" value={deliverable.status} />}
      />
      <Typography
        variant="body2"
        sx={{ mt: 0.5, ...(deliverable.is_overdue && { color: 'error.main', fontWeight: 600 }) }}
      >
        Due {formatDate(deliverable.due_date)} ({relativeDue(deliverable.due_date, today)})
      </Typography>
    </>
  )
}
