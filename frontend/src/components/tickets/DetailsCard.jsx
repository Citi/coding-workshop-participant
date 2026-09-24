import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import PropTypes from 'prop-types'

/**
 * A titled card of facts as a description list: labels on the left, values on the right.
 * Values wrap; long ones never widen the card.
 */
function DetailsCard({ title = 'Details', rows }) {
  return (
    <Card component="section" aria-label={title} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600 }}>
        {title}
      </Typography>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', rowGap: 1.5, columnGap: 1, fontSize: 14, alignItems: 'center' }}>
        {rows.map(([term, value]) => (
          <Box key={term} sx={{ display: 'contents' }}>
            <Box component="dt" sx={{ color: 'text.secondary' }}>
              {term}
            </Box>
            <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
              {value}
            </Box>
          </Box>
        ))}
      </Box>
    </Card>
  )
}

DetailsCard.propTypes = {
  title: PropTypes.string,
  /** [label, value] pairs; the value can be text or an element. */
  rows: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.node)).isRequired,
}

export default DetailsCard
