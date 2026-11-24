import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

const FIELD_SX = { maxWidth: { sm: 220 } }

/**
 * "From" / "To" date pickers for an inclusive date range (shown under the FilterBar).
 * onChange(name, value) with name 'date_from' | 'date_to'; `error` is shown on "To".
 */
export default function DateRangeFilter({ from = '', to = '', error, onChange, label = 'Date range' }) {
  return (
    <Paper role="group" aria-label={label} sx={{ p: 2, mb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          type="date"
          label="From"
          value={from}
          onChange={(event) => onChange('date_from', event.target.value)}
          sx={FIELD_SX}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: to || undefined } }}
        />
        <TextField
          type="date"
          label="To"
          value={to}
          error={Boolean(error)}
          helperText={error}
          onChange={(event) => onChange('date_to', event.target.value)}
          sx={FIELD_SX}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from || undefined } }}
        />
      </Stack>
    </Paper>
  )
}
