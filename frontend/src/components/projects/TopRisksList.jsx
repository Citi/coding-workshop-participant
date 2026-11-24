import { useId } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { projectPath } from './projectUtils.js';
import EmptyState from '../EmptyState.jsx';
import RiskChip from '../RiskChip.jsx';
import { RISK_LEVELS } from '../../constants.js';

/**
 * One project in the top risks list: level and score chip, a link to its Risk tab and the
 * first evidence line explaining the score.
 * @param {object} props - Component props.
 * @param {{project_id: number, project_name: string, risk_score: number, risk_level: string,
 *   headline: string}} props.risk - TopRiskOut.
 * @returns {JSX.Element} The list item.
 */
function TopRiskItem({ risk }) {
  return (
    <ListItem divider disableGutters sx={{ display: 'block', py: 1.5 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <RiskChip level={risk.risk_level} score={risk.risk_score} />
        <Link
          component={RouterLink}
          to={projectPath(risk.project_id, 'risk')}
          sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}
        >
          {risk.project_name}
        </Link>
      </Stack>
      {risk.headline ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          {risk.headline}
        </Typography>
      ) : null}
    </ListItem>
  );
}

TopRiskItem.propTypes = {
  risk: PropTypes.shape({
    project_id: PropTypes.number.isRequired,
    project_name: PropTypes.string.isRequired,
    risk_score: PropTypes.number.isRequired,
    risk_level: PropTypes.oneOf(RISK_LEVELS).isRequired,
    headline: PropTypes.string,
  }).isRequired,
};

/**
 * Dashboard card listing the highest-scoring projects, each linking to its Risk tab
 * (spec 1, question 2: which projects are at risk, and why).
 * @param {object} props - Component props.
 * @param {object[]} [props.risks] - `top_risks` from the dashboard API, highest first.
 * @param {boolean} [props.loading] - Show skeleton lines.
 * @returns {JSX.Element} The card.
 */
export default function TopRisksList({ risks = [], loading = false }) {
  const headingId = useId();
  let body;
  if (loading) {
    body = (
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} variant="rounded" height={56} />
        ))}
      </Stack>
    );
  } else if (risks.length === 0) {
    body = <EmptyState icon={<VerifiedOutlinedIcon />} title="No projects to rank" message="Risk scores appear once projects exist." />;
  } else {
    body = (
      <List disablePadding aria-labelledby={headingId}>
        {risks.map((risk) => (
          <TopRiskItem key={risk.project_id} risk={risk} />
        ))}
      </List>
    );
  }

  return (
    <Paper variant="outlined" component="section" aria-labelledby={headingId} sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography id={headingId} variant="h6" component="h2">
            Top risks
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Highest scores first; open a project to see the evidence behind its score.
          </Typography>
        </Box>
        <Button component={RouterLink} to="/risk" size="small" endIcon={<ArrowForwardIcon />} sx={{ flexShrink: 0 }}>
          All risks
        </Button>
      </Box>
      {body}
    </Paper>
  );
}

TopRisksList.propTypes = {
  risks: PropTypes.arrayOf(PropTypes.object),
  loading: PropTypes.bool,
};
