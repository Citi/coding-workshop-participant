import { useState } from 'react'
import PropTypes from 'prop-types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import { ApiError } from '../../services/apiClient'
import { NOTE_LIMIT, noteError } from '../../utils/noteValidation'
import NoteList from './NoteList'

/** "Add a note" box. Hidden for closed tickets, since the API rejects those notes. */
function AddNoteForm({ ticketId, addNote, placeholder, onAdded }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const problem = noteError(text)
    setError(problem)
    if (problem) return

    setSending(true)
    try {
      await addNote(ticketId, text)
      setText('')
      onAdded()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack spacing={1.5}>
        <TextField
          id="note-text"
          label="Add a note"
          placeholder={placeholder}
          multiline
          minRows={3}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError('')
          }}
          error={Boolean(error)}
          helperText={error || `${text.trim().length}/${NOTE_LIMIT}`}
          disabled={sending}
          fullWidth
        />
        <Box>
          <Button
            type="submit"
            variant="contained"
            disabled={sending}
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {sending ? 'Adding note…' : 'Add note'}
          </Button>
        </Box>
      </Stack>
    </form>
  )
}

AddNoteForm.propTypes = {
  ticketId: PropTypes.number.isRequired,
  addNote: PropTypes.func.isRequired,
  placeholder: PropTypes.string.isRequired,
  onAdded: PropTypes.func.isRequired,
}

/**
 * The ticket's conversation: notes from the employee and engineers, oldest first,
 * with a box to add one while the ticket is still open. `addNote(ticketId, text)` is
 * the caller's API (employees and engineers post to different routes).
 */
function TicketNotes({ ticketId, closed, notes, addNote, placeholder, onAdded }) {
  return (
    <Stack spacing={3}>
      <NoteList notes={notes} />
      {closed ? (
        <Alert severity="info">This ticket is closed, so new notes can&apos;t be added.</Alert>
      ) : (
        <AddNoteForm ticketId={ticketId} addNote={addNote} placeholder={placeholder} onAdded={onAdded} />
      )}
    </Stack>
  )
}

TicketNotes.propTypes = {
  ticketId: PropTypes.number.isRequired,
  closed: PropTypes.bool.isRequired,
  notes: NoteList.propTypes.notes,
  addNote: PropTypes.func.isRequired,
  placeholder: PropTypes.string.isRequired,
  onAdded: PropTypes.func.isRequired,
}

export default TicketNotes
