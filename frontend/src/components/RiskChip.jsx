import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import { RISK_LABELS, RISK_LEVELS } from '../constants.js';
import { RISK_PALETTE_KEYS } from '../theme.js';

/**
 * Risk level chip. The colour comes from the theme's risk palette and the text always
 * names the level (and score when given), so colour is never the only signal.
 * @param {object} props - Component props.
 * @param {'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'} props.level - Risk level.
 * @param {number} [props.score] - Risk score 0-100, shown after the level.
 * @param {'small'|'medium'} [props.size] - Chip size.
 * @returns {JSX.Element} The chip.
 */
export default function RiskChip({ level, score, size = 'small' }) {
  const known = Object.hasOwn(RISK_PALETTE_KEYS, level ?? '');
  const levelLabel = known ? RISK_LABELS[level] : 'Unknown';
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const label = hasScore ? `${levelLabel} · ${score}` : levelLabel;
  return (
    <Chip
      size={size}
      label={label}
      color={known ? RISK_PALETTE_KEYS[level] : 'default'}
      variant={known ? 'filled' : 'outlined'}
      title={hasScore ? `Risk ${levelLabel.toLowerCase()}, score ${score} of 100` : `Risk ${levelLabel.toLowerCase()}`}
    />
  );
}

RiskChip.propTypes = {
  level: PropTypes.oneOf(RISK_LEVELS),
  score: PropTypes.number,
  size: PropTypes.oneOf(['small', 'medium']),
};
