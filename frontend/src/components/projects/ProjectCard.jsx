import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import StatusChip from '../common/StatusChip';
import { SHADOWS } from '../../styles/theme';
import { formatCompactCurrency, formatDateRange, formatPercent, ratio } from '../../utils/formatters';

/**
 * Compact project summary for card grids.
 *
 * The whole card is one link target rather than a card containing a link, so
 * keyboard users get a single tab stop and the entire surface is clickable.
 */
export default function ProjectCard({ project }) {
  const navigate = useNavigate();

  const consumed = ratio(project.budgetConsumed, project.plannedBudget);
  const isOverspent = consumed > 1;
  const hasBudget = Number(project.plannedBudget) > 0;

  return (
    <Card
      component={motion.div}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      sx={{ height: '100%', '&:hover': { boxShadow: SHADOWS.hover } }}
    >
      <CardActionArea
        onClick={() => navigate(`/projects/${project.id}`)}
        sx={{ height: '100%', alignItems: 'stretch' }}
      >
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h4" component="h3" noWrap title={project.name}>
                {project.name}
              </Typography>
              {project.department && (
                <Typography variant="caption" color="text.secondary">
                  {project.department}
                </Typography>
              )}
            </Box>
            <StatusChip value={project.status} />
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {formatDateRange(project.startDate, project.endDate)}
          </Typography>

          {project.ownerName && (
            <Typography variant="body2" color="text.secondary">
              Manager: {project.ownerName}
            </Typography>
          )}

          {project.avgCompletion != null && (
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Completion
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatPercent(project.avgCompletion, { alreadyPercent: true })}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                // Clamped: a backend reporting more than 100 should not
                // overflow the track.
                value={Math.min(100, Math.max(0, Number(project.avgCompletion)))}
                aria-label={`${project.avgCompletion}% complete on average`}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          )}

          {hasBudget && (
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Budget
              </Typography>
              <Typography
                variant="caption"
                fontWeight={600}
                color={isOverspent ? 'error.main' : 'text.secondary'}
              >
                {formatCompactCurrency(project.budgetConsumed)} /{' '}
                {formatCompactCurrency(project.plannedBudget)}
              </Typography>
            </Stack>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
