import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FilterBar from '../components/FilterBar.jsx';
import KpiTile from '../components/KpiTile.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import AllocationsSection from '../components/portfolio/AllocationsSection.jsx';
import ConflictSummary from '../components/portfolio/ConflictSummary.jsx';
import EmployeeCapacityDetail from '../components/portfolio/EmployeeCapacityDetail.jsx';
import ExpandableTable from '../components/portfolio/ExpandableTable.jsx';
import { BottleneckFlag } from '../components/portfolio/Flags.jsx';
import PercentBar from '../components/portfolio/PercentBar.jsx';
import { FULL_LOAD, loadTone } from '../components/portfolio/capacityUtils.js';
import { isDateRangeValid, parseId } from '../components/portfolio/formUtils.js';
import { useDepartmentsLookup, useProjectsLookup, useUsersLookup } from '../components/portfolio/lookups.js';
import useApi from '../hooks/useApi.js';
import { getCapacity } from '../services/analytics.js';
import { formatDate } from '../utils/format.js';

const STATUS_ORDER = { OVER_ALLOCATED: 0, FULLY_ALLOCATED: 1, AVAILABLE: 2 };
const NO_EMPLOYEES = Object.freeze([]);
/** Wide enough for a full date ("12/31/2026") plus the picker icon at every desktop width. */
const DATE_FIELD_SIZE = { xs: 12, sm: 6, md: 4, lg: 3 };
/** Results kept on screen while the period is invalid are dimmed (and explained in words). */
const STALE_SX = { opacity: 0.5, transition: 'opacity 150ms' };

/**
 * Order people so the over-allocated come first, then the fully allocated, then by name.
 * @param {object[]} employees - `employees` of `GET /analytics/capacity`.
 * @returns {object[]} A sorted copy.
 */
function sortEmployees(employees) {
  return [...employees].sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) ||
      b.peak_load - a.peak_load ||
      a.user_name.localeCompare(b.user_name),
  );
}

function buildColumns(departmentNames) {
  return [
    {
      field: 'user_name',
      header: 'Person',
      primary: true,
      render: (row) => (
        <Box component="span" sx={{ display: 'block' }}>
          <Box component="span" sx={{ display: 'block', fontWeight: 600 }}>
            {row.user_name}
          </Box>
          <Typography component="span" variant="body2" color="text.secondary">
            {departmentNames.get(row.department_id) ?? 'No department'}
          </Typography>
        </Box>
      ),
    },
    { field: 'status', header: 'Status', render: (row) => <StatusChip status={row.status} /> },
    {
      field: 'peak_load',
      header: 'Peak load',
      align: 'right',
      render: (row) => (
        <Box component="span" sx={{ fontWeight: row.peak_load > FULL_LOAD ? 700 : 400 }}>
          {row.peak_load}%
        </Box>
      ),
    },
    {
      field: 'current_load',
      header: 'Load today',
      render: (row) => <PercentBar value={row.current_load} tone={loadTone(row.current_load)} />,
    },
    {
      field: 'conflicts',
      header: 'Conflict windows',
      render: (row) => <ConflictSummary conflicts={row.conflicts ?? []} />,
    },
    {
      field: 'is_compound_bottleneck',
      header: 'Bottleneck',
      render: (row) =>
        row.is_compound_bottleneck ? (
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
            <BottleneckFlag />
            <Typography component="span" variant="body2" color="text.secondary">
              {(row.bottleneck_deliverables ?? []).map((deliverable) => deliverable.title).join(', ')}
            </Typography>
          </Box>
        ) : (
          'No'
        ),
    },
  ];
}

/**
 * Resource capacity (route /capacity), answering spec question 5: who is allocated above
 * 100% across overlapping timelines. Per person: peak load, load today, status, compound
 * bottleneck flag with the deliverables involved, and each conflict window's load and dates;
 * opening the row lists the allocations behind every window. Tiles never show unmeasured
 * zeros: they wait for data, step aside for an error, and dim (with a note) while the period
 * is invalid. Below, the allocations themselves, which ADMIN and PM can
 * create, edit and delete; a save that over-allocates someone shows the API's warning.
 * @returns {JSX.Element} The page.
 */
export default function CapacityPage() {
  const departments = useDepartmentsLookup();
  const projects = useProjectsLookup();
  const users = useUsersLookup();
  const [department, setDepartment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const rangeValid = isDateRangeValid(from, to);
  const departmentId = parseId(department);
  const capacity = useApi(
    (signal) =>
      getCapacity(
        { department_id: departmentId ?? undefined, from: from || undefined, to: to || undefined },
        { signal },
      ),
    [departmentId, from, to],
    { enabled: rangeValid },
  );

  const employees = capacity.data?.employees ?? NO_EMPLOYEES;
  const sorted = useMemo(() => sortEmployees(employees), [employees]);
  const columns = useMemo(() => buildColumns(departments.nameById), [departments.nameById]);
  const loaded = Boolean(capacity.data);
  // Nothing loaded and the request failed: show the error, not zeros that look like answers.
  const failed = Boolean(capacity.error) && !loaded;
  // A reversed period is never sent, so what is on screen belongs to the last valid one.
  const stale = loaded && !rangeValid;
  const tilesLoading = !loaded && capacity.loading;
  const bottleneckCount = employees.filter((employee) => employee.is_compound_bottleneck).length;
  const peak = sorted.reduce((best, employee) => (!best || employee.peak_load > best.peak_load ? employee : best), null);
  const filtered = Boolean(department || from || to);
  const overAllocated = capacity.data?.over_allocated_count ?? 0;
  let overAllocatedTone = 'default';
  if (loaded) {
    overAllocatedTone = overAllocated > 0 ? 'error' : 'success';
  }
  let peakHint = '';
  if (loaded) {
    peakHint = peak ? peak.user_name : 'No allocations';
  }
  /** A tile's value once loaded; a dash before that (never a zero that was not measured). */
  const tileValue = (value) => (loaded ? value : '—');
  let empty = { title: 'No allocations yet', message: 'Create allocations below to see each person’s load.' };
  if (!rangeValid) {
    empty = { title: 'Fix the period first', message: 'Choose a To date on or after From.' };
  } else if (filtered) {
    empty = {
      title: 'Nobody is allocated in this selection',
      message: 'Try another department or period, or clear the filters.',
    };
  }

  const clearFilters = () => {
    setDepartment('');
    setFrom('');
    setTo('');
  };

  return (
    <>
      <PageHeader
        title="Resource Capacity"
        subtitle={
          capacity.data?.as_of
            ? `Who is allocated above 100% across overlapping timelines, as of ${formatDate(capacity.data.as_of)}. Over-allocated people are listed first.`
            : 'Who is allocated above 100% across overlapping timelines. Over-allocated people are listed first.'
        }
      />

      <FilterBar
        filters={[
          {
            name: 'department_id',
            label: 'Department',
            value: department,
            options: departments.options,
            allLabel: 'All departments',
          },
        ]}
        onFilterChange={(_, value) => setDepartment(value)}
      >
        <Grid size={DATE_FIELD_SIZE}>
          <TextField
            fullWidth
            size="small"
            type="date"
            label="From"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={DATE_FIELD_SIZE}>
          <TextField
            fullWidth
            size="small"
            type="date"
            label="To"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            error={!rangeValid}
            helperText={rangeValid ? undefined : 'Must be on or after From.'}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 'auto' }}>
          <Button onClick={clearFilters} disabled={!filtered} startIcon={<FilterAltOffIcon />}>
            Clear filters
          </Button>
        </Grid>
      </FilterBar>

      {stale ? (
        <Alert severity="info" role="status" sx={{ mb: 2 }}>
          The figures below are for the last valid period. Choose a To date on or after From to update them.
        </Alert>
      ) : null}

      {failed ? null : (
        <Grid container spacing={2} sx={{ mb: 3, ...(stale ? STALE_SX : null) }} data-testid="capacity-kpis">
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KpiTile
              label="People allocated"
              value={tileValue(employees.length)}
              hint={filtered ? 'In the selected department and period' : 'Everyone with an allocation'}
              icon={<GroupsOutlinedIcon />}
              loading={tilesLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KpiTile
              label="Over-allocated"
              value={tileValue(overAllocated)}
              hint="Above 100% now or in a coming window"
              tone={overAllocatedTone}
              icon={<WarningAmberIcon />}
              loading={tilesLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KpiTile
              label="Compound bottlenecks"
              value={tileValue(bottleneckCount)}
              hint="Over-allocated and holding blocked or late work"
              tone={bottleneckCount > 0 ? 'warning' : 'default'}
              icon={<PriorityHighIcon />}
              loading={tilesLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KpiTile
              label="Highest peak load"
              value={peak ? `${peak.peak_load}%` : '—'}
              hint={peakHint}
              tone={peak && peak.peak_load > FULL_LOAD ? 'error' : 'default'}
              icon={<TrendingUpIcon />}
              loading={tilesLoading}
            />
          </Grid>
        </Grid>
      )}

      <Box component="section" aria-labelledby="capacity-people-heading">
        <Typography id="capacity-people-heading" variant="h5" component="h2" sx={{ fontWeight: 600, mb: 1.5 }}>
          People and load
        </Typography>
        <Box sx={stale ? STALE_SX : undefined}>
          <ExpandableTable
            columns={columns}
            rows={sorted}
            getRowId={(row) => row.user_id}
            renderDetail={(row) => <EmployeeCapacityDetail employee={row} projectNames={projects.nameById} />}
            detailLabel={(row) => `conflict windows and load for ${row.user_name}`}
            loading={capacity.loading}
            error={capacity.error}
            onRetry={capacity.reload}
            ariaLabel="Capacity by person"
            emptyTitle={empty.title}
            emptyMessage={empty.message}
          />
        </Box>
      </Box>

      <AllocationsSection
        userOptions={users.options}
        projectOptions={projects.options}
        defaultStartDate={capacity.data?.as_of}
        onChanged={capacity.reload}
      />
    </>
  );
}

/** Takes no props. */
CapacityPage.propTypes = {};
