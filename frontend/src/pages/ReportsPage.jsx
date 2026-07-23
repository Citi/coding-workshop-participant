import { useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatusChip from '../components/common/StatusChip';
import BudgetBar from '../components/budget/BudgetBar';
import DependencyChain from '../components/deliverables/DependencyChain';
import useApi from '../hooks/useApi';
import {
  getAllocations,
  getAtRiskProjects,
  getBudgetReport,
  getDependencies,
  getUtilization,
} from '../services/reportService';
import { formatCurrency, formatDate } from '../utils/formatters';

/**
 * The four analytical views, each answering one of ACME's questions directly.
 *
 * Every tab loads only when opened -- these are the heaviest queries in the
 * app, and fetching all four on mount would make the page slow to first paint
 * for the sake of data most visits never look at.
 */
export default function ReportsPage() {
  const [tab, setTab] = useState(0);

  const atRisk = useApi(getAtRiskProjects, { immediate: tab === 0, deps: [tab], initialData: [] });
  const utilization = useApi(getUtilization, { immediate: tab === 1, deps: [tab], initialData: [] });
  const allocations = useApi(getAllocations, { immediate: tab === 1, deps: [tab], initialData: [] });
  const dependencies = useApi(getDependencies, { immediate: tab === 2, deps: [tab] });
  const budget = useApi(getBudgetReport, { immediate: tab === 3, deps: [tab], initialData: [] });

  return (
    <Box>
      <PageHeader title="Reports" subtitle="Portfolio health, workload, dependencies and spend" />

      <Tabs value={tab} onChange={(_, next) => setTab(next)} variant="scrollable" sx={{ mb: 2 }}>
        <Tab label="At risk" />
        <Tab label="Utilization" />
        <Tab label="Dependencies" />
        <Tab label="Budget" />
      </Tabs>

      {/* Q: Which projects are at risk of missing their deadlines? */}
      {tab === 0 && (
        <DataTable
          columns={[
            { field: 'name', header: 'Project', primary: true },
            {
              field: 'riskLevel',
              header: 'Risk',
              render: (row) => <StatusChip value={row.riskLevel} />,
            },
            { field: 'ownerName', header: 'Manager', hideOnMobile: true },
            { field: 'endDate', header: 'Due', render: (row) => formatDate(row.endDate) },
            {
              field: 'daysRemaining',
              header: 'Days left',
              render: (row) => (
                <Typography
                  variant="body2"
                  color={row.daysRemaining < 0 ? 'error.main' : 'text.primary'}
                >
                  {row.daysRemaining ?? '—'}
                </Typography>
              ),
            },
            {
              field: 'reasons',
              header: 'Why',
              sortable: false,
              render: (row) => (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  {(row.reasons ?? []).map((reason) => (
                    <Chip key={reason} label={reason} size="small" variant="outlined" />
                  ))}
                </Stack>
              ),
            },
          ]}
          rows={atRisk.data ?? []}
          loading={atRisk.loading}
          error={atRisk.error}
          onRetry={atRisk.refresh}
          searchable={false}
          emptyTitle="Nothing at risk"
          emptyDescription="No project is currently overdue, overspent or behind schedule."
        />
      )}

      {/* Q: Who is over-allocated? + How are resources allocated? */}
      {tab === 1 && (
        <Stack spacing={3}>
          <DataTable
            columns={[
              { field: 'fullName', header: 'Person', primary: true },
              { field: 'roleTitle', header: 'Role', hideOnMobile: true },
              {
                field: 'allocatedPct',
                header: 'Allocated',
                render: (row) => (
                  <Stack sx={{ minWidth: 130 }}>
                    <Typography
                      variant="caption"
                      fontWeight={600}
                      color={row.isOverAllocated ? 'error.main' : 'text.secondary'}
                    >
                      {row.allocatedPct}% of {row.capacityPct}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, Number(row.allocatedPct ?? 0))}
                      color={row.isOverAllocated ? 'error' : 'primary'}
                      sx={{ height: 5, borderRadius: 3 }}
                    />
                  </Stack>
                ),
              },
              { field: 'projectCount', header: 'Projects' },
            ]}
            rows={utilization.data ?? []}
            rowKey="resourceId"
            loading={utilization.loading}
            error={utilization.error}
            onRetry={utilization.refresh}
            searchPlaceholder="Search people…"
            emptyTitle="No resources"
          />

          <Box>
            <Typography variant="h3" component="h3" sx={{ mb: 1.5 }}>
              Allocation across projects
            </Typography>
            <DataTable
              columns={[
                { field: 'fullName', header: 'Person', primary: true },
                { field: 'projectName', header: 'Project' },
                {
                  field: 'allocationPct',
                  header: 'Share',
                  render: (row) => `${row.allocationPct}%`,
                },
                {
                  field: 'projectStatus',
                  header: 'Project status',
                  hideOnMobile: true,
                  render: (row) => <StatusChip value={row.projectStatus} />,
                },
              ]}
              rows={allocations.data ?? []}
              rowKey="projectId"
              loading={allocations.loading}
              error={allocations.error}
              onRetry={allocations.refresh}
              searchable={false}
              emptyTitle="No active allocations"
            />
          </Box>
        </Stack>
      )}

      {/* Q: What is the dependency chain between deliverables? */}
      {tab === 2 && (
        <Stack spacing={3}>
          {dependencies.loading && <CircularProgress size={24} />}
          {dependencies.error && <Alert severity="error">{dependencies.error.message}</Alert>}

          {dependencies.data && (
            <>
              {dependencies.data.bottlenecks?.length > 0 && (
                <Paper sx={{ p: 2.5 }}>
                  <Typography variant="h3" component="h3" gutterBottom>
                    Bottlenecks
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Incomplete deliverables that other work is waiting on. Unblocking these
                    releases the most downstream work.
                  </Typography>
                  <Stack spacing={1}>
                    {dependencies.data.bottlenecks.map((item) => (
                      <Stack
                        key={item.id}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {item.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.projectName} · {item.completionPercentage}% ·{' '}
                            {formatDate(item.dueDate)}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {item.isOverdue && <Chip label="Overdue" size="small" color="error" />}
                          <Chip
                            label={`blocks ${item.blockingCount}`}
                            size="small"
                            color="warning"
                          />
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              )}

              <Box>
                <Typography variant="h3" component="h3" sx={{ mb: 1.5 }}>
                  Chains
                </Typography>
                <DependencyChain
                  nodes={dependencies.data.nodes ?? []}
                  edges={dependencies.data.edges ?? []}
                />
              </Box>
            </>
          )}
        </Stack>
      )}

      {/* Q: How much budget has been consumed versus planned? */}
      {tab === 3 && (
        <DataTable
          columns={[
            { field: 'projectName', header: 'Project', primary: true },
            {
              field: 'status',
              header: 'Status',
              hideOnMobile: true,
              render: (row) => <StatusChip value={row.status} />,
            },
            {
              field: 'plannedBudget',
              header: 'Planned',
              align: 'right',
              render: (row) => formatCurrency(row.plannedBudget),
            },
            {
              field: 'budgetConsumed',
              header: 'Consumed',
              align: 'right',
              render: (row) => formatCurrency(row.budgetConsumed),
            },
            {
              field: 'variance',
              header: 'Variance',
              align: 'right',
              render: (row) => (
                <Typography
                  variant="body2"
                  fontWeight={600}
                  color={row.isOverspent ? 'error.main' : 'success.main'}
                >
                  {formatCurrency(row.variance)}
                </Typography>
              ),
            },
            {
              field: 'consumedRatio',
              header: 'Progress',
              sortable: false,
              render: (row) => (
                <BudgetBar
                  planned={row.plannedBudget}
                  consumed={row.budgetConsumed}
                  showLabels={false}
                />
              ),
            },
          ]}
          rows={budget.data ?? []}
          rowKey="projectId"
          loading={budget.loading}
          error={budget.error}
          onRetry={budget.refresh}
          searchPlaceholder="Search projects…"
          emptyTitle="No budget data"
        />
      )}
    </Box>
  );
}
