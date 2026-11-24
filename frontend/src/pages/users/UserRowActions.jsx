import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { SELF_DELETE_REASON } from './userFields'

/**
 * Edit / Delete buttons for one user row. The logged-in admin's own row keeps a disabled Delete
 * button with a tooltip saying why (a disabled button gets no mouse events, hence the <span>).
 */
export default function UserRowActions({ user, isSelf, canUpdate, canDelete, onEdit, onDelete }) {
  const deleteLabel = `Delete ${user.full_name}`
  return (
    <>
      {canUpdate && (
        <IconButton aria-label={`Edit ${user.full_name}`} onClick={() => onEdit(user)}>
          <EditIcon />
        </IconButton>
      )}
      {canDelete &&
        (isSelf ? (
          <Tooltip title={SELF_DELETE_REASON} describeChild>
            <span>
              <IconButton aria-label={deleteLabel} color="error" disabled>
                <DeleteIcon />
              </IconButton>
            </span>
          </Tooltip>
        ) : (
          <IconButton aria-label={deleteLabel} color="error" onClick={() => onDelete(user)}>
            <DeleteIcon />
          </IconButton>
        ))}
    </>
  )
}
