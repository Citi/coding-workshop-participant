import { createTheme } from '@mui/material/styles';

/**
 * Design tokens. Teal "ink" for structure, marigold for time (the thing this
 * tool measures), sage for done, brick for overdue. Borders over shadows.
 */
export const tokens = {
  ink: '#12343B',
  inkSoft: '#2C5A63',
  paper: '#FBFBF8',
  surface: '#FFFFFF',
  graphite: '#2E3338',
  muted: '#5F6B70',
  line: '#DCE1DE',
  marigold: '#E8A317',
  marigoldSoft: '#FCEFD2',
  sage: '#4F7D5E',
  sageSoft: '#E3EEE6',
  brick: '#B4432F',
  brickSoft: '#F7E1DC',
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: tokens.ink, light: tokens.inkSoft, contrastText: '#FFFFFF' },
    secondary: { main: tokens.marigold, contrastText: tokens.graphite },
    success: { main: tokens.sage },
    error: { main: tokens.brick },
    warning: { main: '#A86A00' },
    background: { default: tokens.paper, paper: tokens.surface },
    text: { primary: tokens.graphite, secondary: tokens.muted },
    divider: tokens.line,
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif',
    h1: { fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 },
    h2: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.25 },
    h3: { fontSize: '1.2rem', fontWeight: 700, lineHeight: 1.3 },
    h4: { fontSize: '1.05rem', fontWeight: 700 },
    body1: { fontSize: '1rem', lineHeight: 1.55 },
    body2: { fontSize: '0.9rem', lineHeight: 1.5 },
    button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0 },
    overline: { textTransform: 'none', letterSpacing: 0, fontWeight: 700, fontSize: '0.8rem' },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 6, paddingInline: 14 } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: { borderColor: tokens.line } },
    },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiTextField: { defaultProps: { fullWidth: true, size: 'small' } },
    MuiChip: { styleOverrides: { root: { fontWeight: 700, borderRadius: 6 } } },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, color: tokens.muted, fontSize: '0.85rem', whiteSpace: 'nowrap' },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 700, fontSize: '0.95rem' } } },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700, fontSize: '1.2rem' } } },
    MuiButtonBase: {
      styleOverrides: {
        root: { '&.Mui-focusVisible': { outline: `3px solid ${tokens.marigold}`, outlineOffset: 2 } },
      },
    },
  },
});

export default theme;
