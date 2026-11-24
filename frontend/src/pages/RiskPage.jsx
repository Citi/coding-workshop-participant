import { useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DataTable from '../components/DataTable.jsx';
import FilterBar from '../components/FilterBar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RiskChip from '../components/RiskChip.jsx';
import StatusChip from '../components/StatusChip.jsx';
import PercentBar from '../components/portfolio/PercentBar.jsx';
import { RISK_LABELS, RISK_LEVELS, toOptions } from '../constants.js';
import useApi from '../hooks/useApi.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { getRiskAnalytics } from '../services/analytics.js';
import { RISK_PALETTE_KEYS } from '../theme.js';
import { formatDate } from '../utils/format.js';

const LEVEL_OPTIONS = toOptions([...RISK_LEVELS].reverse(), RISK_LABELS);
const NO_ITEMS = Object.freeze([]);

const riskRowShape = PropTypes.shape({
  project_id: PropTypes.number.isRequired,
  project_name: PropTypes.string.isRequired,
  department_name: PropTypes.string,
  status: PropTypes.string,
  risk_score: PropTypes.number,
  risk_level: PropTypes.string,
  headline: PropTypes.string,
});

/**
 * The scoring factors of one project, largest first, as text: "Schedule 16/20 · Blocked 10/15".
 * @param {Array<{label: string, points: number, max_points: number}>} factors - Risk factors.
 * @returns {string} Non-zero factors, or "No factor triggered".
 */
function describeFactors(factors) {
  const scoring = (factors ?? []).filter((factor) => factor.points > 0).sort((a, b) => b.points - a.points);
  if (scoring.length === 0) {
    return 'No factor triggered';
  }
  return scoring.map((factor) => `${factor.label} ${factor.points}/${factor.max_points}`).join(' · ');
}

function ScoreBar({ row }) {
  return (
    <PercentBar
      value={row.risk_score}
      unit=""
      suffix="of 100"
      tone={RISK_PALETTE_KEYS[row.risk_level] ?? 'primary'}
      barWidth={56}
    />
  );
}

ScoreBar.propTypes = {
  row: riskRowShape.isRequired,
};

function ProjectName({ row }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box component="span" sx={{ fontWeight: 600 }}>
        {row.project_name}
      </Box>
      <ChevronRightIcon fontSize="small" color="action" aria-hidden="true" />
    </Box>
  );
}

ProjectName.propTypes = {
  row: riskRowShape.isRequired,
};

const RANK_COLUMN = { field: 'rank', header: 'Rank', width: 56, render: (row) => `#${row.rank}` };

/** Wide screens: four columns, so the explanation gets most of the width. */
const DESKTOP_COLUMNS = [
  RANK_COLUMN,
  {
    field: 'project_name',
    header: 'Project',
    primary: true,
    width: '28%',
    render: (row) => (
      <Box component="span" sx={{ display: 'block' }}>
        <ProjectName row={row} />
        <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <StatusChip status={row.status} />
          <Typography component="span" variant="body2" color="text.secondary">
            {row.department_name}
          </Typography>
        </Box>
      </Box>
    ),
  },
  {
    field: 'risk_score',
    header: 'Risk',
    width: 160,
    render: (row) => (
      <Stack spacing={0.75} sx={{ alignItems: 'flex-start' }}>
        <RiskChip level={row.risk_level} />
        <ScoreBar row={row} />
      </Stack>
    ),
  },
  {
    field: 'headline',
    header: 'Why',
    render: (row) => (
      <Box component="span" sx={{ display: 'block' }}>
        <Box component="span" sx={{ display: 'block' }}>
          {row.headline}
        </Box>
        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Scoring factors: {describeFactors(row.factors)}
        </Typography>
      </Box>
    ),
  },
];

/** Phones: one card per project with a labelled line per field. */
const MOBILE_COLUMNS = [
  { field: 'project_name', header: 'Project', primary: true, render: (row) => <ProjectName row={row} /> },
  RANK_COLUMN,
  { field: 'risk_level', header: 'Risk level', render: (row) => <RiskChip level={row.risk_level} /> },
  { field: 'risk_score', header: 'Score', render: (row) => <ScoreBar row={row} /> },
  { field: 'status', header: 'Status', render: (row) => <StatusChip status={row.status} /> },
  { field: 'department_name', header: 'Department' },
  { field: 'headline', header: 'Why', render: (row) => row.headline },
];

function LevelSummary({ items }) {
  const counts = items.reduce((result, item) => ({ ...result, [item.risk_level]: (result[item.risk_level] ?? 0) + 1 }), {});
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
        Projects by risk level
      </Typography>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {[...RISK_LEVELS].reverse().map((level) => (
          <Box key={level} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <RiskChip level={level} />
            <Typography component="span" variant="body2">
              {counts[level] ?? 0} project{(counts[level] ?? 0) === 1 ? '' : 's'}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

LevelSummary.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({ risk_level: PropTypes.string })).isRequired,
};

/**
 * Risk intelligence (route /risk), answering spec question 2: which projects are at risk of
 * missing deadlines, and why. Projects ranked by explainable risk score with the level as a
 * text chip, status, department and the headline evidence; each row opens the project's
 * Risk tab (factors, evidence, impacted deliverables and recommended actions).
 * @returns {JSX.Element} The page.
 */
export default function RiskPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useApi((signal) => getRiskAnalytics({}, { signal }), []);

  const items = data?.items ?? NO_ITEMS;
  // The API sends projects highest score first; the rank is the position in that order.
  const ranked = items.map((item, index) => ({ ...item, rank: index + 1 }));
  const term = search.trim().toLowerCase();
  const rows = ranked.filter(
    (item) =>
      (!level || item.risk_level === level) &&
      (!term ||
        item.project_name.toLowerCase().includes(term) ||
        (item.department_name ?? '').toLowerCase().includes(term)),
  );
  const filtered = Boolean(level || term);

  return (
    <>
      <PageHeader
        title="Risk Intelligence"
        subtitle={
          data?.as_of
            ? `Projects ranked by explainable delivery risk, as of ${formatDate(data.as_of)}. Open a project to see the evidence and recommended actions.`
            : 'Projects ranked by explainable delivery risk. Open a project to see the evidence and recommended actions.'
        }
      />

      {items.length > 0 ? <LevelSummary items={items} /> : null}

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchLabel="Search projects"
        searchPlaceholder="Project or department"
        filters={[{ name: 'risk_level', label: 'Risk level', value: level, options: LEVEL_OPTIONS, allLabel: 'Any level' }]}
        onFilterChange={(_, value) => setLevel(value)}
        onClear={() => {
          setLevel('');
          setSearch('');
        }}
      />

      <DataTable
        columns={isMobile ? MOBILE_COLUMNS : DESKTOP_COLUMNS}
        rows={rows}
        getRowId={(row) => row.project_id}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(row) => navigate(`/projects/${row.project_id}?tab=risk`)}
        ariaLabel="Projects ranked by risk"
        emptyTitle={filtered ? 'No projects match these filters' : 'No projects yet'}
        emptyMessage={filtered ? 'Try another level or search, or clear the filters.' : 'Projects appear here once created.'}
      />
    </>
  );
}

/** Takes no props. */
RiskPage.propTypes = {};
