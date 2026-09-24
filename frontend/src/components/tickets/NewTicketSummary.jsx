import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import PropTypes from 'prop-types'

import { brand } from '../../theme'

/**
 * Live summary of the ticket being reported: category, location and who is affected,
 * with "Not chosen yet" for gaps. Deliberately no priority: employees never
 * see it. Explains what happens after submitting instead.
 */
function NewTicketSummary({ rows }) {
  return (
    <Card component="aside" aria-labelledby="summary-title" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Typography id="summary-title" component="h2" sx={{ fontSize: 15, fontWeight: 600 }}>
        Summary
      </Typography>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', rowGap: 1.25, fontSize: 14 }}>
        {rows.map(([term, detail]) => (
          <Box key={term} sx={{ display: 'contents' }}>
            <Box component="dt" sx={{ color: 'text.secondary' }}>
              {term}
            </Box>
            <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere', color: detail ? 'text.primary' : 'text.secondary', fontStyle: detail ? 'normal' : 'italic' }}>
              {detail || 'Not chosen yet'}
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', px: 1.75, py: 1.5, borderRadius: 1.25, bgcolor: 'background.default' }}>
        <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 20, color: 'primary.main', mt: 0.125 }} />
        <Typography sx={{ fontSize: 13, lineHeight: 1.45, color: brand.inkSoft }}>
          A Facility Admin reviews your ticket and assigns an engineer. You&apos;ll see every update on the ticket&apos;s page.
        </Typography>
      </Box>
    </Card>
  )
}

NewTicketSummary.propTypes = {
  /** [label, value] pairs; an empty value shows "Not chosen yet". */
  rows: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.string)).isRequired,
}

export default NewTicketSummary
