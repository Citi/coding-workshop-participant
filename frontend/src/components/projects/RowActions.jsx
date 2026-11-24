import PropTypes from 'prop-types';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

/**
 * Edit and delete buttons for one table row or card. Each button is named after the record
 * ("Edit Project Alpha") for screen readers; pass only the handlers the role may use
 * (callers decide with `can` from permissions.js), and nothing renders when neither is given.
 * @param {object} props - Component props.
 * @param {string} props.name - Record name used in the button labels.
 * @param {() => void} [props.onEdit] - Shows the edit button.
 * @param {() => void} [props.onDelete] - Shows the delete button.
 * @param {boolean} [props.disabled] - Disable both buttons.
 * @returns {JSX.Element|null} The buttons.
 */
export default function RowActions({ name, onEdit, onDelete, disabled = false }) {
  if (!onEdit && !onDelete) {
    return null;
  }
  return (
    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
      {onEdit ? (
        <Tooltip title="Edit">
          <span>
            <IconButton size="small" aria-label={`Edit ${name}`} onClick={onEdit} disabled={disabled}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
      {onDelete ? (
        <Tooltip title="Delete">
          <span>
            <IconButton size="small" color="error" aria-label={`Delete ${name}`} onClick={onDelete} disabled={disabled}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
    </Stack>
  );
}

RowActions.propTypes = {
  name: PropTypes.string.isRequired,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  disabled: PropTypes.bool,
};
