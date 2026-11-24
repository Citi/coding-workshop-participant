import PropTypes from 'prop-types';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { fieldLabel, formatStateValue, isFieldChanged, isMoneyField, stateFields } from './auditUtils.js';
import MoneyText from '../MoneyText.jsx';
import { toNumber } from '../../utils/format.js';

// Labels wrap between words only; values (long text, emails, timestamps) may break anywhere.
const labelCell = { verticalAlign: 'top', overflowWrap: 'normal', wordBreak: 'normal' };
const valueCell = { verticalAlign: 'top', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' };
// MUI's Table styles `& caption` (placing it below) with more specificity than a class on the
// caption itself, so the override has to go on the Table.
const tableSx = { '& caption': { captionSide: 'top', px: 2, pt: 1, pb: 0.5 } };

/**
 * One state value for display: money through MoneyText, anything else as text.
 * @param {string} field - Column name.
 * @param {unknown} value - Value from the snapshot.
 * @returns {import('react').ReactNode} The value.
 */
function displayValue(field, value) {
  if (isMoneyField(field) && toNumber(value) !== null) {
    return <MoneyText value={value} />;
  }
  return formatStateValue(value);
}

/**
 * Before and after view of one audit entry. Updates show both states side by side with
 * every changed field marked by a "Changed" label (and bold text), creates show the new
 * values and deletes the removed ones. Money columns are shown through MoneyText.
 * @param {object} props - Component props.
 * @param {'CREATE'|'UPDATE'|'DELETE'} props.action - Audit action.
 * @param {object|null} [props.before] - `before_state` (null for CREATE).
 * @param {object|null} [props.after] - `after_state` (null for DELETE).
 * @returns {JSX.Element} The comparison table.
 */
export default function StateDiff({ action, before = null, after = null }) {
  const fields = stateFields(before, after);
  if (fields.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No recorded values for this change.
      </Typography>
    );
  }
  const showBefore = action !== 'CREATE' && Boolean(before);
  const showAfter = action !== 'DELETE' && Boolean(after);
  let caption = 'Values before and after the change';
  if (!showBefore) {
    caption = 'Values when the record was created';
  } else if (!showAfter) {
    caption = 'Values when the record was deleted';
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" sx={tableSx}>
        <caption>{caption}</caption>
        <TableHead>
          <TableRow>
            <TableCell>Field</TableCell>
            {showBefore ? <TableCell>{showAfter ? 'Before' : 'Value'}</TableCell> : null}
            {showAfter ? <TableCell>{showBefore ? 'After' : 'Value'}</TableCell> : null}
          </TableRow>
        </TableHead>
        <TableBody>
          {fields.map((field) => {
            const changed = showBefore && showAfter && isFieldChanged(before, after, field);
            const weight = changed ? 600 : 400;
            return (
              <TableRow key={field} selected={changed}>
                <TableCell sx={{ ...labelCell, fontWeight: weight }}>
                  {fieldLabel(field)}
                  {changed ? <Chip size="small" label="Changed" variant="outlined" sx={{ ml: 1 }} /> : null}
                </TableCell>
                {showBefore ? (
                  <TableCell sx={{ ...valueCell, fontWeight: weight }}>{displayValue(field, before?.[field])}</TableCell>
                ) : null}
                {showAfter ? (
                  <TableCell sx={{ ...valueCell, fontWeight: weight }}>{displayValue(field, after?.[field])}</TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

StateDiff.propTypes = {
  action: PropTypes.oneOf(['CREATE', 'UPDATE', 'DELETE']).isRequired,
  before: PropTypes.object,
  after: PropTypes.object,
};
