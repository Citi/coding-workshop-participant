import { useId } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import BudgetProgressChart from './BudgetProgressChart.jsx';
import DetailList from './DetailList.jsx';
import SectionHeader from './SectionHeader.jsx';
import { describeDivergence, projectPath } from './projectUtils.js';
import MoneyText from '../MoneyText.jsx';
import RiskChip from '../RiskChip.jsx';
import StatusChip from '../StatusChip.jsx';
import { formatDate, formatPct } from '../../utils/format.js';

/**
 * Overview tab of a project: budget consumed and completion as two bars side by side, the gap
 * between them stated in words, and the project's facts (dates, department, manager, money).
 * @param {object} props - Component props.
 * @param {object} props.project - ProjectOut.
 * @returns {JSX.Element} The tab content.
 */
export default function ProjectOverviewTab({ project }) {
  const progressHeading = useId();
  const detailsHeading = useId();
  const divergence = describeDivergence(project.utilization_pct, project.completion_pct);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 7 }}>
        <Paper variant="outlined" component="section" aria-labelledby={progressHeading} sx={{ p: 2, height: '100%' }}>
          <SectionHeader
            id={progressHeading}
            title="Budget vs progress"
            subtitle="Share of the planned budget spent, next to the share of deliverable work done."
          />
          <BudgetProgressChart utilizationPct={project.utilization_pct} completionPct={project.completion_pct} />
          <Stack direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
            <Typography variant="body2">
              Budget consumed: <strong>{formatPct(project.utilization_pct)}</strong>
            </Typography>
            <Typography variant="body2">
              Completion: <strong>{formatPct(project.completion_pct)}</strong>
            </Typography>
          </Stack>
          <Alert severity={divergence.severity} role="status" sx={{ mt: 2 }}>
            <AlertTitle>{divergence.headline}</AlertTitle>
            {divergence.detail}
          </Alert>
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, md: 5 }}>
        <Paper variant="outlined" component="section" aria-labelledby={detailsHeading} sx={{ p: 2, height: '100%' }}>
          <SectionHeader id={detailsHeading} title="Details" />
          <DetailList
            items={[
              { label: 'Status', value: <StatusChip status={project.status} /> },
              {
                label: 'Risk',
                value: (
                  <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <RiskChip level={project.risk_level} score={project.risk_score} />
                    <Link component={RouterLink} to={projectPath(project.id, 'risk')}>
                      See why
                    </Link>
                  </Stack>
                ),
              },
              { label: 'Department', value: project.department_name },
              { label: 'Project manager', value: project.project_manager_name ?? 'Not assigned' },
              { label: 'Start date', value: formatDate(project.start_date) },
              { label: 'End date', value: formatDate(project.end_date) },
              { label: 'Planned budget', value: <MoneyText value={project.planned_budget} /> },
              { label: 'Spent', value: <MoneyText value={project.actual_spend} /> },
              { label: 'Remaining', value: <MoneyText value={project.remaining_budget} highlightNegative /> },
            ]}
          />
          {project.description ? (
            <>
              <Typography variant="subtitle2" component="h3" sx={{ mt: 2 }}>
                Description
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                {project.description}
              </Typography>
            </>
          ) : null}
        </Paper>
      </Grid>
    </Grid>
  );
}

ProjectOverviewTab.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.number.isRequired,
    status: PropTypes.string,
    risk_level: PropTypes.string,
    risk_score: PropTypes.number,
    department_name: PropTypes.string,
    project_manager_name: PropTypes.string,
    start_date: PropTypes.string,
    end_date: PropTypes.string,
    planned_budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    actual_spend: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    remaining_budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    utilization_pct: PropTypes.number,
    completion_pct: PropTypes.number,
    description: PropTypes.string,
  }).isRequired,
};
