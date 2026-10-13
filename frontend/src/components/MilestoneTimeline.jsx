import PropTypes from 'prop-types';
import { Box, ButtonBase, Typography } from '@mui/material';
import { tokens } from '../theme';
import {
  formatShortDate, MILESTONE_STATUS, parseDate, todayIso,
} from '../utils/format';

const DAY = 86400000;

/**
 * Gantt-style schedule of a project's milestones between the project start
 * and its estimated end (extended if a milestone runs later), with a marker for today.
 */
export default function MilestoneTimeline({
  start, end, milestones, onSelect,
}) {
  const lastEnd = milestones.reduce((max, m) => (m.end_date > max ? m.end_date : max), end);
  const from = parseDate(start).getTime();
  const to = parseDate(lastEnd).getTime() + DAY;
  const span = Math.max(to - from, DAY);
  const pos = (iso) => ((parseDate(iso).getTime() - from) / span) * 100;
  const today = todayIso();
  const todayPos = today >= start && today <= lastEnd ? pos(today) : null;
  const endPos = pos(end) + (DAY / span) * 100;

  return (
    <Box role="list" aria-label="Milestone schedule" sx={{ position: 'relative' }}>
      <Box sx={{
        display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: '220px 1fr', columnGap: 2, mb: 1,
      }}
      >
        <span />
        <Box sx={{
          display: 'flex', justifyContent: 'space-between', color: 'text.secondary', fontSize: '0.8rem',
        }}
        >
          <span>{formatShortDate(start)}</span>
          <span>{formatShortDate(lastEnd)}</span>
        </Box>
      </Box>
      {milestones.map((m) => {
        const left = pos(m.start_date);
        const width = Math.max(pos(m.end_date) + (DAY / span) * 100 - left, 1.5);
        const done = m.status === 'completed';
        const bg = done ? tokens.sage : m.status === 'in_progress' ? tokens.inkSoft : 'transparent';
        const label = `${m.name}: ${formatShortDate(m.start_date)} to ${formatShortDate(m.end_date)}, ${MILESTONE_STATUS[m.status]?.label}${m.is_overdue ? ', overdue' : ''}`;
        return (
          <Box
            role="listitem"
            key={m.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '220px 1fr' },
              columnGap: 2,
              rowGap: 0.5,
              alignItems: 'center',
              py: 1,
              borderTop: `1px solid ${tokens.line}`,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }} noWrap title={m.name}>{m.name}</Typography>
              <Typography variant="body2" color={m.is_overdue ? 'error' : 'text.secondary'}>
                {formatShortDate(m.start_date)}
                {' to '}
                {formatShortDate(m.end_date)}
                {m.is_overdue ? ', overdue' : ''}
              </Typography>
            </Box>
            <Box sx={{ position: 'relative', height: 28 }}>
              <Box sx={{
                position: 'absolute', top: 13, left: 0, right: 0, height: 2, bgcolor: '#EEF1EF',
              }}
              />
              <ButtonBase
                onClick={onSelect ? () => onSelect(m) : undefined}
                disabled={!onSelect}
                aria-label={onSelect ? `Edit ${label}` : label}
                sx={{
                  position: 'absolute',
                  top: 4,
                  height: 20,
                  left: `${left}%`,
                  width: `${width}%`,
                  borderRadius: '4px',
                  bgcolor: bg,
                  border: `2px solid ${m.is_overdue ? tokens.brick : done ? tokens.sage : tokens.inkSoft}`,
                  backgroundImage: m.status === 'not_started'
                    ? `repeating-linear-gradient(135deg, transparent 0 5px, ${tokens.line} 5px 7px)` : 'none',
                }}
              />
            </Box>
          </Box>
        );
      })}
      {/* Today + estimated end markers (desktop only, aligned to the bar column). */}
      <Box
        aria-hidden
        sx={{
          display: { xs: 'none', sm: 'block' },
          position: 'absolute',
          top: 24,
          bottom: 0,
          left: 'calc(220px + 16px)',
          right: 0,
          pointerEvents: 'none',
        }}
      >
        {todayPos !== null && (
          <Box sx={{
            position: 'absolute', top: 0, bottom: 0, left: `${todayPos}%`, borderLeft: `2px solid ${tokens.marigold}`,
          }}
          >
            <Typography
              variant="body2"
              sx={{
                position: 'absolute', top: -22, left: 4, fontWeight: 700, color: '#8A5F00', whiteSpace: 'nowrap',
              }}
            >
              Today
            </Typography>
          </Box>
        )}
        {endPos < 99.5 && (
          <Box sx={{
            position: 'absolute', top: 0, bottom: 0, left: `${endPos}%`, borderLeft: `1px dashed ${tokens.muted}`,
          }}
          />
        )}
      </Box>
    </Box>
  );
}

MilestoneTimeline.propTypes = {
  start: PropTypes.string.isRequired,
  end: PropTypes.string.isRequired,
  milestones: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    start_date: PropTypes.string.isRequired,
    end_date: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    is_overdue: PropTypes.bool,
  })).isRequired,
  onSelect: PropTypes.func,
};
