import { useId } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ImpactedDeliverablesList from './ImpactedDeliverablesList.jsx';
import RiskFactorBars from './RiskFactorBars.jsx';
import SectionHeader from './SectionHeader.jsx';
import { useReloadOnChange } from './useReloadOnChange.js';
import ErrorState from '../ErrorState.jsx';
import EvidenceList from '../EvidenceList.jsx';
import RiskChip from '../RiskChip.jsx';
import { useApi } from '../../hooks/useApi.js';
import { getProjectRisk } from '../../services/projects.js';
import { formatDate } from '../../utils/format.js';

/**
 * Headline of the risk detail: the score out of 100, the level as a labelled chip and the date
 * the score was computed for.
 * @param {object} props - Component props.
 * @param {{risk_score: number, risk_level: string, as_of?: string}} props.risk - Risk detail.
 * @returns {JSX.Element} The card.
 */
function RiskScoreCard({ risk }) {
  const headingId = useId();
  return (
    <Paper variant="outlined" component="section" aria-labelledby={headingId} sx={{ p: 2 }}>
      <Typography id={headingId} variant="h6" component="h2">
        Risk score
      </Typography>
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
        <Typography variant="h3" component="p" sx={{ fontWeight: 700, lineHeight: 1 }}>
          <Box component="span" data-testid="risk-score">
            {risk.risk_score}
          </Box>
          <Box component="span" sx={{ typography: 'h6', color: 'text.secondary', ml: 0.5 }}>
            / 100
          </Box>
        </Typography>
        <RiskChip level={risk.risk_level} size="medium" />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        {risk.as_of ? `As of ${formatDate(risk.as_of)}. ` : ''}Levels: 0–24 low, 25–49 medium, 50–74 high,
        75–100 critical.
      </Typography>
    </Paper>
  );
}

RiskScoreCard.propTypes = {
  risk: PropTypes.shape({
    risk_score: PropTypes.number.isRequired,
    risk_level: PropTypes.string.isRequired,
    as_of: PropTypes.string,
  }).isRequired,
};

/**
 * Placeholder layout while the risk detail loads.
 * @returns {JSX.Element} Skeletons in the shape of the tab.
 */
function RiskTabSkeleton() {
  return (
    <Grid container spacing={2} aria-busy="true" aria-label="Loading risk detail">
      <Grid size={{ xs: 12, lg: 5 }}>
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={140} />
          <Skeleton variant="rounded" height={360} />
        </Stack>
      </Grid>
      <Grid size={{ xs: 12, lg: 7 }}>
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={220} />
          <Skeleton variant="rounded" height={220} />
        </Stack>
      </Grid>
    </Grid>
  );
}

/** Takes no props. */
RiskTabSkeleton.propTypes = {};

/**
 * Risk tab of a project (spec 9.4 and 12.4): the score and level, one bar per factor
 * (points out of the factor's maximum, with its detail), the evidence the score is built from,
 * the deliverables held up downstream and the recommended actions. The detail is fetched again
 * whenever `revision` changes (the page bumps it after the project is edited from its header),
 * keeping the previous detail on screen, under a progress bar, until the new one arrives.
 * @param {object} props - Component props.
 * @param {{id: number}} props.project - The project.
 * @param {number} [props.revision] - Changes whenever the project was saved; triggers a refetch.
 * @returns {JSX.Element} The tab content.
 */
export default function RiskTab({ project, revision = 0 }) {
  const factorsHeading = useId();
  const impactedHeading = useId();
  const projectId = project.id;
  const {
    data: risk,
    error,
    loading,
    reload,
  } = useApi((signal) => getProjectRisk(projectId, {}, { signal }), [projectId]);
  useReloadOnChange(revision, reload);

  if (error && !risk) {
    return <ErrorState error={error} onRetry={reload} title="Could not load the risk detail" />;
  }
  if (!risk) {
    return <RiskTabSkeleton />;
  }

  return (
    <Box aria-busy={loading}>
      {loading ? <LinearProgress aria-label="Recalculating the risk score" sx={{ mb: 1, borderRadius: 1 }} /> : null}
      {error ? <ErrorState error={error} onRetry={reload} title="Could not refresh the risk detail" /> : null}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={2}>
            <RiskScoreCard risk={risk} />
            <Paper variant="outlined" component="section" aria-labelledby={factorsHeading} sx={{ p: 2 }}>
              <SectionHeader
                id={factorsHeading}
                title="What the score is made of"
                subtitle="Each bar fills to the factor's points on a track as long as its maximum; the score is their sum."
              />
              <RiskFactorBars factors={risk.factors ?? []} />
            </Paper>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <EvidenceList
                title="Evidence"
                items={risk.evidence ?? []}
                variant="evidence"
                headingComponent="h2"
                emptyMessage="No evidence lines were returned."
              />
            </Paper>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <EvidenceList
                title="Recommended actions"
                items={risk.recommended_actions ?? []}
                variant="action"
                headingComponent="h2"
                emptyMessage="No action needed: no risk factor scored points."
              />
            </Paper>
            <Paper variant="outlined" component="section" aria-labelledby={impactedHeading} sx={{ p: 2 }}>
              <SectionHeader
                id={impactedHeading}
                title="Impacted deliverables"
                subtitle="Work held up by a blocked or overdue deliverable upstream."
              />
              <ImpactedDeliverablesList items={risk.impacted_deliverables ?? []} />
            </Paper>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}

RiskTab.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.number.isRequired,
  }).isRequired,
  revision: PropTypes.number,
};
