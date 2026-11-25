import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { formatPercent } from '../../utils/format'
import { ItemHeader, RecordLink } from './DashboardBits'
import DashboardSection, { SectionList } from './DashboardSection'
import { countLabel } from '../../utils/text'

/**
 * People allocated more than 100% across active projects (highest total first), with the
 * allocations that add up to it. totals: the dashboard's `resources` counters.
 */
export default function OverAllocatedSection({ resources, totals = {} }) {
  return (
    <DashboardSection
      title="Over-allocated team members"
      description="Allocated more than 100% across active projects."
      viewAll={{ to: '/resources?over_allocated=true', label: 'View all over-allocated team members', permission: 'resources:read' }}
    >
      <SectionList
        items={resources}
        label="Over-allocated team members"
        emptyTitle="Nobody is over-allocated"
        emptyMessage={
          totals.total
            ? `Everyone is allocated 100% or less (${countLabel(totals.total, 'team member')}).`
            : 'Team members show here once they are added.'
        }
        renderItem={(resource) => <OverAllocatedPerson resource={resource} />}
      />
    </DashboardSection>
  )
}

function OverAllocatedPerson({ resource }) {
  const allocations = resource.allocations || []
  return (
    <>
      <ItemHeader
        title={
          <RecordLink to={`/resources/${resource.id}`} permission="resources:read">
            {resource.full_name}
          </RecordLink>
        }
        subtitle={`${resource.job_title} · ${resource.department}`}
        aside={
          <Box sx={{ textAlign: 'right' }}>
            <Typography component="div" variant="h6" sx={{ color: 'error.main', fontWeight: 700, lineHeight: 1.2 }}>
              {formatPercent(resource.total_allocation_percent)}
            </Typography>
            <Typography component="div" variant="caption" color="textSecondary">
              allocated
            </Typography>
          </Box>
        }
      />
      {allocations.length > 0 && (
        <Box
          component="ul"
          aria-label={`Active project allocations of ${resource.full_name}`}
          sx={{ listStyle: 'none', m: 0, mt: 1, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}
        >
          {allocations.map((allocation) => (
            <li key={allocation.project_id}>
              <Chip size="small" variant="outlined" label={`${allocation.project_name}: ${formatPercent(allocation.allocation_percent)}`} />
            </li>
          ))}
        </Box>
      )}
    </>
  )
}
