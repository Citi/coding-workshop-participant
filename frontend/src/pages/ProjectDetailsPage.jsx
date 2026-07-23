import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import StatusChip from '../components/common/StatusChip';
import BudgetBar from '../components/budget/BudgetBar';
import DependencyChain from '../components/deliverables/DependencyChain';
import DeliverablesPage from './DeliverablesPage';
import useApi from '../hooks/useApi';
import { getProject, getProjectSummary } from '../services/projectService';
import { getProjectGraph } from '../services/deliverableService';
import { listAllocations } from '../services/resourceService';
import { formatCurrency, formatDate, formatDateRange } from '../utils/formatters';

/**
 * One project in full: header facts, deliverables, dependency chain, team.
 *
 * The tabs each own their data, so opening the page costs one project fetch
 * rather than four -- the graph and allocations load only when looked at.
 */
export default function ProjectDetailsPage() {
  const { id } = useParams();
  const [tab, setTab] = useState(0);

  const project = useApi(() => getProject(id), { immediate: true, deps: [id] });
  const summary = useApi(() => getProjectSummary(id), { immediate: true, deps: [id] });

  // Loaded per tab rather than up front.
  const graph = useApi(() => getProjectGraph(id), { immediate: tab === 1, deps: [id, tab] });
  const team = useApi(() => listAllocations({ projectId: id }), {
    immediate: tab === 2,
    deps: [id, tab],
    initialData: [],
  });

  if (project.loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }} role="status">
        <CircularProgress aria-label="Loading project" />
      </Box>
    );
  }

  if (project.error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={project.refresh}>
            Retry
          </Button>
        }
      >
        {project.error.message}
      </Alert>
    );
  }

  const record = project.data;
  if (!record) return null;

  const facts = summary.data;

  return (
    <Box>
      <Button
        component={RouterLink}
        to="/projects"
        startIcon={<ArrowBackIcon />}
        size="small"
        sx={{ mb: 1 }}
      >
        All projects
      </Button>

      <PageHeader
        title={record.name}
        subtitle={record.description || undefined}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <StatusChip value={record.status} />
            {record.atRisk && <Chip label="At risk" color="error" size="small" />}
          </Stack>
        }
      />

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="subtitle2" gutterBottom>
              Schedule
            </Typography>
            <Typography variant="body2">
              {formatDateRange(record.startDate, record.endDate)}
            </Typography>
            {record.ownerName && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Manager: {record.ownerName}
              </Typography>
            )}
            {record.department && (
              <Typography variant="body2" color="text.secondary">
                Department: {record.department}
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="subtitle2" gutterBottom>
              Budget
            </Typography>
            <BudgetBar planned={record.plannedBudget} consumed={record.budgetConsumed} />
            <Typography variant="caption" color="text.secondary">
              {formatCurrency(record.plannedBudget)} planned
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="subtitle2" gutterBottom>
              Deliverables
            </Typography>
            {summary.loading ? (
              <CircularProgress size={20} />
            ) : facts ? (
              <Stack spacing={0.5}>
                <Typography variant="body2">
                  {facts.completedDeliverables} of {facts.totalDeliverables} complete
                </Typography>
                {facts.overdueDeliverables > 0 && (
                  <Typography variant="body2" color="error.main">
                    {facts.overdueDeliverables} overdue
                  </Typography>
                )}
                {facts.blockedDeliverables > 0 && (
                  <Typography variant="body2" color="warning.main">
                    {facts.blockedDeliverables} blocked
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                —
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ mb: 2 }}>
        <Tab label="Deliverables" />
        <Tab label="Dependency chain" />
        <Tab label="Team" />
      </Tabs>

      {tab === 0 && <DeliverablesPage projectId={id} embedded />}

      {tab === 1 && (
        <Box>
          {graph.loading && <CircularProgress size={24} />}
          {graph.error && <Alert severity="error">{graph.error.message}</Alert>}
          {graph.data && (
            <DependencyChain nodes={graph.data.nodes} edges={graph.data.edges} />
          )}
        </Box>
      )}

      {tab === 2 && (
        <Paper sx={{ p: 2.5 }}>
          {team.loading && <CircularProgress size={24} />}
          {team.error && <Alert severity="error">{team.error.message}</Alert>}
          {!team.loading && !team.error && (team.data ?? []).length === 0 && (
            <Typography color="text.secondary">Nobody is allocated to this project yet.</Typography>
          )}
          <Stack divider={<Divider />} spacing={1}>
            {(team.data ?? []).map((allocation) => (
              <Stack
                key={allocation.id}
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ pt: 1 }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    {allocation.resourceName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(allocation.startDate)} –{' '}
                    {allocation.endDate ? formatDate(allocation.endDate) : 'ongoing'}
                  </Typography>
                </Box>
                <Chip
                  label={`${allocation.allocationPct}%`}
                  size="small"
                  color={allocation.isActive ? 'primary' : 'default'}
                  variant={allocation.isActive ? 'filled' : 'outlined'}
                />
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
