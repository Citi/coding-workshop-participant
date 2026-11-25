// One MUI theme for consistent colours, typography, spacing and interaction states.
import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1d4ed8' },
    secondary: { main: '#7c3aed' },
    success: { main: '#15803d' },
    warning: { main: '#b45309' },
    error: { main: '#b91c1c' },
    // Darker than MUI's default info blue so white chip text meets WCAG AA contrast (4.5:1)
    info: { main: '#0369a1' },
    background: { default: '#f5f7fb', paper: '#ffffff' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: '1px solid #e5e7eb' } } },
    MuiAppBar: { styleOverrides: { root: { border: 'none' } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 600, color: '#374151', backgroundColor: '#f9fafb' } } },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiFormControl: { defaultProps: { size: 'small' } },
  },
})
