import PropTypes from 'prop-types';
import { useMediaQuery } from 'react-responsive';
import {
  Box, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import { formatDate, formatHours } from '../utils/format';

/**
 * List of time entries. Columns adapt to context (hide project inside a
 * project page, hide person on an employee's own log) and collapse to rows on phones.
 */
export default function TimeEntriesTable({
  entries, showProject = true, showPerson = true, canEdit = () => false, onEdit, onArchive,
}) {
  const isWide = useMediaQuery({ minWidth: 760 });

  const actions = (e) => (canEdit(e) ? (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Tooltip title="Edit entry">
        <IconButton size="small" onClick={() => onEdit(e)} aria-label={`Edit ${formatHours(e.hours)} on ${formatDate(e.work_date)}`}>
          <EditOutlined fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Archive entry">
        <IconButton size="small" onClick={() => onArchive(e)} aria-label={`Archive ${formatHours(e.hours)} on ${formatDate(e.work_date)}`}>
          <Inventory2Outlined fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  ) : null);

  if (!isWide) {
    return (
      <Stack spacing={1}>
        {entries.map((e) => (
          <Paper key={e.id} variant="outlined" sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>
                {formatHours(e.hours)}
                {showPerson ? `, ${e.user_name}` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {[formatDate(e.work_date), showProject ? e.project_name : null, e.milestone_name].filter(Boolean).join(', ')}
              </Typography>
              {e.note && <Typography variant="body2">{e.note}</Typography>}
            </Box>
            {actions(e)}
          </Paper>
        ))}
      </Stack>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            {showPerson && <TableCell>Person</TableCell>}
            {showProject && <TableCell>Project</TableCell>}
            <TableCell>Milestone</TableCell>
            <TableCell>Note</TableCell>
            <TableCell align="right">Hours</TableCell>
            <TableCell align="right"><span className="visually-hidden">Actions</span></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(e.work_date)}</TableCell>
              {showPerson && <TableCell>{e.user_name}</TableCell>}
              {showProject && <TableCell>{e.project_name}</TableCell>}
              <TableCell>{e.milestone_name || <Typography variant="body2" color="text.secondary">General</Typography>}</TableCell>
              <TableCell sx={{ maxWidth: 320 }}>{e.note}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>{formatHours(e.hours)}</TableCell>
              <TableCell align="right" sx={{ width: 96 }}>{actions(e)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

TimeEntriesTable.propTypes = {
  entries: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    work_date: PropTypes.string.isRequired,
    hours: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  })).isRequired,
  showProject: PropTypes.bool,
  showPerson: PropTypes.bool,
  canEdit: PropTypes.func,
  onEdit: PropTypes.func,
  onArchive: PropTypes.func,
};
