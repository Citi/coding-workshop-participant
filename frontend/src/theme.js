import { createTheme } from '@mui/material/styles'

/**
 * Brand colors: Citi light blue and white, with navy for headings.
 * Sky blue fails contrast on white (about 2:1), so use it only for decoration, never text.
 */
export const brand = {
  blue: '#056DAE',
  navy: '#003B70',
  sky: '#00BDF2',
  page: '#F5F9FC',
  white: '#FFFFFF',
  /** Body text, secondary text and quiet labels (all pass AA on white). */
  ink: '#1A2733',
  inkSoft: '#3A4A5A',
  muted: '#5B6B7A',
  /** Hairlines between panels, and the tint behind the current nav item. */
  line: '#E3EAF1',
  selected: '#E3F0FA',
}

/** Width of the desktop sidebar, in px. */
export const SIDEBAR_WIDTH = 248

const theme = createTheme({
  palette: {
    primary: { main: brand.blue, dark: brand.navy, contrastText: brand.white },
    secondary: { main: brand.navy, contrastText: brand.white },
    background: { default: brand.page, paper: brand.white },
    text: { primary: brand.ink, secondary: brand.muted },
    divider: brand.line,
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h1: { color: brand.navy, fontWeight: 600 },
    h2: { color: brand.navy, fontWeight: 600 },
    h3: { color: brand.navy, fontWeight: 600 },
    h4: { color: brand.navy, fontWeight: 600 },
    h5: { color: brand.navy, fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiAppBar: { defaultProps: { elevation: 0 } },
    MuiButton: { defaultProps: { disableElevation: true } },
    // Mockup surfaces: a hairline border and 12px corners.
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: { borderColor: brand.line, borderRadius: 12 } },
    },
  },
})

export default theme
