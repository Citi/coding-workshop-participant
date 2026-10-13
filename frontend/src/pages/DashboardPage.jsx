import { Link as RouterLink } from 'react-router-dom';
import PropTypes from 'prop-types';
import {
  Box, Link, Paper, Stack, Typography,
} from '@mui/material';
import useApi from '../hooks/useApi';
import { api } from '../services/api';
import { useAuth } from '../services/AuthContext';
import PageHeader from '../components/PageHeader';
import CapacityBar from '../components/CapacityBar';
import StatusChip from '../components/StatusChip';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import { tokens } from '../theme';
import {
  formatDays, formatHours, formatMoney, formatNumber, formatShortDate,
} from '../utils/format';

function statsFor(role, s) {
  if (role === 'admin') {
    return [
      ['Active projects', formatNumber(s.projects_active), `${s.projects_total} open in total`],
      ['Overdue projects', formatNumber(s.projects_overdue), 'past estimated end date'],
      ['Hours logged', formatHours(s.hours_total), formatDays(s.hours_total)],
      ['People', formatNumber((s.employees || 0) + (s.managers || 0)), `${s.managers} managers, ${s.employees} employees`],
      ['Budget under management', formatMoney(s.budget_total), 'across open projects'],
    ];
  }
  if (role === 'manager') {
    return [
      ['Projects you run', formatNumber(s.projects_total), `${s.projects_active} active`],
      ['Your team', formatNumber(s.team_size), s.team_size === 1 ? 'direct report' : 'direct reports'],
      ['Hours this week', formatHours(s.hours_this_week), 'on your projects'],
      ['Overdue milestones', formatNumber(s.milestones_overdue), 'need attention'],
    ];
  }
  return [
    ['Your projects', formatNumber(s.projects_total), `${s.projects_active} active`],
    ['Hours logged', formatHours(s.hours_total), formatDays(s.hours_total)],
    ['Overdue milestones', formatNumber(s.milestones_overdue), 'on your projects'],
  ];
}

/** Headline numbers in one ruled strip rather than a grid of cards. */
function StatStrip({ items }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${items.length}, 1fr)` },
        mb: 4,
        overflow: 'hidden',
        // On two-column phones, let an odd final stat span the full row.
        '& > :last-of-type:nth-of-type(odd)': { gridColumn: { xs: 'span 2', md: 'auto' } },
      }}
    >
      {items.map(([label, value, hint]) => (
        <Box
          key={label}
          sx={{
            p: 2.5,
            borderRight: `1px solid ${tokens.line}`,
            borderBottom: { xs: `1px solid ${tokens.line}`, md: 0 },
            marginRight: '-1px',
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700 }}>{label}</Typography>
          <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2, mt: 0.5 }}>{value}</Typography>
          <Typography variant="body2" color="text.secondary">{hint}</Typography>
        </Box>
      ))}
    </Paper>
  );
}

StatStrip.propTypes = { items: PropTypes.arrayOf(PropTypes.array).isRequired };

/** Last eight weeks of logged hours as a simple column chart. */
function WeeklyHours({ weeks }) {
  const max = Math.max(...weeks.map((w) => Number(w.hours)), 40);
  return (
    <Box>
      <Box
        role="img"
        aria-label={`Hours logged per week: ${weeks.map((w) => `${formatShortDate(w.week)} ${formatHours(w.hours)}`).join(', ')}`}
        sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 120 }}
      >
        {weeks.map((w) => (
          <Box key={w.week} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{formatNumber(w.hours)}</Typography>
            <Box sx={{ width: '100%', maxWidth: 36, height: `${(Number(w.hours) / max) * 90}px`, bgcolor: tokens.marigold, borderRadius: '3px 3px 0 0', minHeight: 2 }} />
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        {weeks.map((w) => (
          <Typography key={w.week} variant="body2" color="text.secondary" sx={{ flex: 1, textAlign: 'center', fontSize: '0.75rem' }}>
            {formatShortDate(w.week)}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

WeeklyHours.propTypes = { weeks: PropTypes.arrayOf(PropTypes.object).isRequired };

/** Role-aware overview: headline numbers, project capacity, upcoming milestones. */
export default function DashboardPage() {
  const { user } = useAuth();
  const {
    data, loading, error, reload,
  } = useApi(() => api.get('/dashboard'), []);

  const firstName = user.name.split(' ')[0];

  if (loading && !data) return <Loading label="Loading overview" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { stats } = data;
  return (
    <>
      <PageHeader
        title={`Hello, ${firstName}`}
        subtitle={user.role === 'employee'
          ? 'Here is where your projects and hours stand.'
          : 'Here is how your projects are tracking against plan.'}
      />

      <StatStrip items={statsFor(user.role, stats)} />

      {user.role === 'employee' && (
        <Paper variant="outlined" sx={{ p: 2.5, mb: 4 }}>
          <Typography variant="h3" component="h2" gutterBottom>Your week</Typography>
          <CapacityBar logged={stats.hours_this_week} planned={stats.capacity_this_week} label="expected so far this week" />
        </Paper>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, gap: 3 }}>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
            <Typography variant="h3" component="h2">Projects by deadline</Typography>
            <Link component={RouterLink} to="/projects" sx={{ fontWeight: 700 }}>All projects</Link>
          </Box>
          {data.projects.length === 0 ? (
            <EmptyState title="No projects yet">
              {user.role === 'admin' ? 'Create a project and assign a manager to get started.' : 'Projects you are assigned to will appear here.'}
            </EmptyState>
          ) : (
            <Stack divider={<Box sx={{ borderTop: `1px solid ${tokens.line}` }} />}>
              {data.projects.map((p) => (
                <Box key={p.id} sx={{ py: 1.75, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 220px' }, gap: { xs: 1, sm: 3 }, alignItems: 'center' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Link component={RouterLink} to={`/projects/${p.id}`} underline="hover" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {p.name}
                      </Link>
                      <StatusChip status={p.status} overdue={p.is_overdue} />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {`Due ${formatShortDate(p.estimated_end_date)}, ${p.milestones_completed} of ${p.milestone_count} milestones done, managed by ${p.manager_name}`}
                    </Typography>
                  </Box>
                  <CapacityBar logged={p.total_hours} planned={p.planned_hours} compact />
                </Box>
              ))}
            </Stack>
          )}
        </Paper>

        <Stack spacing={3}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h3" component="h2" gutterBottom>Milestones due in the next 30 days</Typography>
            {data.upcoming_milestones.length === 0 ? (
              <Typography color="text.secondary">Nothing due soon.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {data.upcoming_milestones.map((m) => (
                  <Box key={m.id} sx={{ borderLeft: `3px solid ${m.is_overdue ? tokens.brick : tokens.marigold}`, pl: 1.5 }}>
                    <Typography sx={{ fontWeight: 700 }}>{m.name}</Typography>
                    <Typography variant="body2" color={m.is_overdue ? 'error' : 'text.secondary'}>
                      {m.is_overdue ? `Overdue since ${formatShortDate(m.end_date)}` : `Due ${formatShortDate(m.end_date)}`}
                      {', '}
                      <Link component={RouterLink} to={`/projects/${m.project_id}`} color="inherit">{m.project_name}</Link>
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h3" component="h2" gutterBottom>
              {user.role === 'employee' ? 'Your hours by week' : 'Hours by week'}
            </Typography>
            {data.weekly_hours.length ? <WeeklyHours weeks={data.weekly_hours} /> : <Typography color="text.secondary">No time logged in the last 8 weeks.</Typography>}
          </Paper>
        </Stack>
      </Box>
    </>
  );
}
