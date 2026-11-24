import { useMemo, useState } from 'react';
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
      render: (row) => {
        const count = row.conflicts?.length ?? 0;
        return count === 0 ? 'None' : `${count} window${count === 1 ? '' : 's'} above 100%`;
      },
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
 * bottleneck flag with the deliverables involved, and expandable conflict windows listing
 * the allocations behind them. Below, the allocations themselves, which ADMIN and PM can
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
  const bottleneckCount = employees.filter((employee) => employee.is_compound_bottleneck).length;
  const peak = sorted.reduce((best, employee) => (!best || employee.peak_load > best.peak_load ? employee : best), null);
  const filtered = Boolean(department || from || to);

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
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
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
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
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

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="People allocated"
            value={employees.length}
            hint={filtered ? 'In the selected department and period' : 'Everyone with an allocation'}
            icon={<GroupsOutlinedIcon />}
            loading={!loaded && capacity.loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="Over-allocated"
            value={capacity.data?.over_allocated_count ?? 0}
            hint="Above 100% now or in a coming window"
            tone={(capacity.data?.over_allocated_count ?? 0) > 0 ? 'error' : 'success'}
            icon={<WarningAmberIcon />}
            loading={!loaded && capacity.loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="Compound bottlenecks"
            value={bottleneckCount}
            hint="Over-allocated and holding blocked or late work"
            tone={bottleneckCount > 0 ? 'warning' : 'default'}
            icon={<PriorityHighIcon />}
            loading={!loaded && capacity.loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiTile
            label="Highest peak load"
            value={peak ? `${peak.peak_load}%` : '—'}
            hint={peak ? peak.user_name : 'No allocations'}
            tone={peak && peak.peak_load > FULL_LOAD ? 'error' : 'default'}
            icon={<TrendingUpIcon />}
            loading={!loaded && capacity.loading}
          />
        </Grid>
      </Grid>

      <Box component="section" aria-labelledby="capacity-people-heading">
        <Typography id="capacity-people-heading" variant="h5" component="h2" sx={{ fontWeight: 600, mb: 1.5 }}>
          People and load
        </Typography>
        <ExpandableTable
          columns={columns}
          rows={sorted}
          getRowId={(row) => row.user_id}
          renderDetail={(row) => <EmployeeCapacityDetail employee={row} projectNames={projects.nameById} />}
          toggleLabel={(row) => `Show conflict windows and load for ${row.user_name}`}
          loading={capacity.loading}
          error={capacity.error}
          onRetry={capacity.reload}
          ariaLabel="Capacity by person"
          emptyTitle={filtered ? 'Nobody is allocated in this selection' : 'No allocations yet'}
          emptyMessage={
            filtered
              ? 'Try another department or period, or clear the filters.'
              : 'Create allocations below to see each person’s load.'
          }
        />
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
