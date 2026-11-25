import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { formatDate, relativeDue } from '../utils/format'

// Text colours for each urgency tone; all of them reach 4.5:1 contrast on white, on the grey page
// background and on the amber tint of blocker rows (DependencyList). The label text carries the
// meaning, so the colour is never the only cue.
const TONE_STYLES = {
  overdue: { color: 'error.main', fontWeight: 600 },
  soon: { color: 'warning.dark', fontWeight: 600 },
  later: { color: 'text.secondary' },
}

/** A date or an urgency phrase is read as one unit: in a narrow table column it never breaks ("Ends in 2 / months"). */
const ONE_LINE = { whiteSpace: 'nowrap' }

/**
 * The label of a relativeDue() result in its tone's colour and weight ("3 days overdue" in bold red),
 * so urgency looks the same everywhere. A caption by default, as under <DueDate>'s date;
 * variant="inherit" sets it inside a line of text ("Zeus ERP · Due Jan 10, 2026 · 3 days overdue").
 * Renders nothing when there is no urgency (relativeDue returned null).
 */
export function UrgencyLabel({ urgency, variant = 'caption' }) {
  if (!urgency) return null
  return (
    <Typography component="span" variant={variant} sx={[ONE_LINE, TONE_STYLES[urgency.tone]]}>
      {urgency.label}
    </Typography>
  )
}

/**
 * A date with its urgency underneath: "Mar 1, 2026" over "Due in 3 days" / "2 days overdue".
 * kind="end" words it for end dates ("Ends tomorrow"); done hides the label (finished work is not
 * urgent); today ('YYYY-MM-DD', default: today in UTC) is what the date is compared with.
 * The formatted date is its own element, so getByText('Mar 1, 2026') still finds it.
 */
export default function DueDate({ date, kind = 'due', done = false, today }) {
  const urgency = relativeDue(date, { kind, done, today })
  return (
    <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column' }}>
      <Box component="span" sx={ONE_LINE}>
        {formatDate(date)}
      </Box>
      {urgency && (
        <>
          {' '}
          <UrgencyLabel urgency={urgency} />
        </>
      )}
    </Box>
  )
}
