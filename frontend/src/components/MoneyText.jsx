import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import { formatMoney, toNumber } from '../utils/format.js';

/**
 * Money amount in the platform's single currency (Intl.NumberFormat with the CURRENCY
 * constant from utils/format.js). Accepts the API's decimal strings such as "400000.00".
 * @param {object} props - Component props.
 * @param {number|string|null} props.value - Amount.
 * @param {boolean} [props.compact] - Short form such as "$400K"; the full amount is in the tooltip.
 * @param {boolean} [props.highlightNegative] - Show negative amounts (overspend) in the error colour.
 * @param {object} [props.sx] - Extra MUI styles.
 * @returns {JSX.Element} The formatted amount.
 */
export default function MoneyText({ value, compact = false, highlightNegative = false, sx }) {
  const amount = toNumber(value);
  const negative = amount !== null && amount < 0;
  return (
    <Box
      component="span"
      title={compact ? formatMoney(value) : undefined}
      sx={{
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        color: highlightNegative && negative ? 'error.main' : undefined,
        ...sx,
      }}
    >
      {formatMoney(value, { compact })}
    </Box>
  );
}

MoneyText.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  compact: PropTypes.bool,
  highlightNegative: PropTypes.bool,
  sx: PropTypes.object,
};
