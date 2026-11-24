import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

/** KPI tile: label, big value and an optional helper line. */
export default function StatCard({ label, value, helper, color = 'text.primary', icon }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Typography variant="body2" color="textSecondary">{label}</Typography>
        {icon}
      </Box>
      <Typography variant="h4" component="p" sx={{ color, fontWeight: 700, my: 0.5 }}>{value}</Typography>
      {helper && <Typography variant="body2" color="textSecondary">{helper}</Typography>}
    </Paper>
  )
}
