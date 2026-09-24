import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import SendIcon from '@mui/icons-material/Send'
import PropTypes from 'prop-types'

import { ApiError } from '../../services/apiClient'
import { NOTE_LIMIT, noteError } from '../../utils/noteValidation'

/**
 * The box at the foot of a ticket's thread: a note that grows as it's typed, with a
 * character count, and "Add note". Side by side on larger screens, stacked on phones.
 * `addNote(ticketId, text)` is the caller's API.
 */
function NoteComposer({ ticketId, addNote, placeholder, onAdded }) {
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
    <Box
      component="form"
      onSubmit={handleSubmit}
      noValidate
      sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'flex-start' }, gap: 1.5 }}
    >
      <TextField
        id="note-text"
        label="Add a note"
        placeholder={placeholder}
        multiline
        minRows={1}
        maxRows={8}
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
      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={sending}
        startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
        sx={{ flex: 'none', minHeight: 56 }}
      >
        {sending ? 'Adding note…' : 'Add note'}
      </Button>
    </Box>
  )
}

NoteComposer.propTypes = {
  ticketId: PropTypes.number.isRequired,
  addNote: PropTypes.func.isRequired,
  placeholder: PropTypes.string.isRequired,
  onAdded: PropTypes.func.isRequired,
}

export default NoteComposer
