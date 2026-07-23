import { createTheme } from '@mui/material/styles';

/**
 * The single source of truth for colour, type, elevation and spacing.
 *
 * Components should reach for theme tokens (`sx={{ color: 'text.secondary' }}`,
 * `spacing(2)`) rather than hard-coded hex values or pixel padding, so a change
 * here propagates everywhere. The visual language is a modern, soft-elevation
 * SaaS dashboard: an indigo brand on a cool neutral canvas, generous radii, and
 * layered shadows in place of hard 1px borders.
 */

// 8px base grid. Every margin and padding in the app is a multiple of this.
const SPACING_UNIT = 8;

// Layered, low-contrast shadows. Hard borders read as "old admin panel"; soft
// shadows give depth without visual noise. Exported so components can opt into
// the hover lift without re-deriving the values.
export const SHADOWS = {
  card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
  raised: '0 4px 12px rgba(16, 24, 40, 0.08), 0 2px 4px rgba(16, 24, 40, 0.04)',
  hover: '0 12px 28px rgba(16, 24, 40, 0.10), 0 4px 8px rgba(16, 24, 40, 0.05)',
};

const palette = {
  mode: 'light',
  primary: {
    main: '#4f46e5', // indigo-600
    light: '#6366f1',
    dark: '#3730a3',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#0d9488', // teal-600
    light: '#14b8a6',
    dark: '#0f766e',
    contrastText: '#ffffff',
  },
  success: { main: '#12b76a', light: '#32d583', dark: '#027a48', contrastText: '#ffffff' },
  warning: { main: '#f79009', light: '#fdb022', dark: '#b54708', contrastText: '#ffffff' },
  error: { main: '#f04438', light: '#f97066', dark: '#b42318', contrastText: '#ffffff' },
  info: { main: '#2e90fa', light: '#53b1fd', dark: '#175cd3', contrastText: '#ffffff' },
  background: { default: '#f6f7fb', paper: '#ffffff' },
  text: { primary: '#101828', secondary: '#667085', disabled: '#98a2b3' },
  divider: 'rgba(16, 24, 40, 0.08)',
};

const theme = createTheme({
  palette,
  spacing: SPACING_UNIT,
  shape: { borderRadius: 12 },

  typography: {
    fontFamily: [
      '"Inter"',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: { fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
    h2: { fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.015em' },
    h3: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.01em' },
    h4: { fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.005em' },
    h5: { fontSize: '0.9375rem', fontWeight: 600 },
    h6: { fontSize: '0.875rem', fontWeight: 600 },
    subtitle2: {
      fontSize: '0.75rem',
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: palette.text.secondary,
    },
    body2: { fontSize: '0.875rem', lineHeight: 1.55 },
    caption: { fontSize: '0.75rem', lineHeight: 1.4 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  },

  // These values are the same ones the react-responsive queries use, so the
  // drawer and table/card switch points stay in sync across both mechanisms.
  breakpoints: {
    values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Smoother font rendering for the variable Inter face.
        body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        // Never hide the keyboard focus ring: it is the only affordance
        // keyboard and screen-reader users have for locating themselves.
        ':focus-visible': {
          outline: `2px solid ${palette.primary.main}`,
          outlineOffset: 2,
        },
        // A quieter, thinner scrollbar than the OS default keeps the chrome
        // from competing with content.
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(16, 24, 40, 0.18)',
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-thumb:hover': { backgroundColor: 'rgba(16, 24, 40, 0.30)' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 16 },
        containedPrimary: {
          // A soft brand-tinted shadow reads as a raised, tappable surface.
          boxShadow: '0 1px 2px rgba(79, 70, 229, 0.24)',
          '&:hover': { boxShadow: '0 4px 12px rgba(79, 70, 229, 0.32)' },
        },
      },
    },
    MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        // Frosted glass: a translucent white with a blur, so the canvas gradient
        // shows faintly through every surface. Soft shadow + hairline border
        // hold the shape; the shadow does the separating on light-on-light.
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${palette.divider}`,
          boxShadow: SHADOWS.card,
        },
        // Menu/popover surfaces stay near-opaque -- text over a floating list
        // needs the contrast -- and lift instead of a boxed border.
        elevation8: {
          border: 'none',
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          boxShadow: SHADOWS.hover,
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${palette.divider}`,
          boxShadow: SHADOWS.card,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: palette.divider },
        head: {
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          color: palette.text.secondary,
          // Translucent so the frosted table reads as one glass sheet.
          backgroundColor: 'rgba(248, 249, 252, 0.75)',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 140ms ease',
          '&.MuiTableRow-hover:hover': { backgroundColor: 'rgba(79, 70, 229, 0.06)' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          // The selected nav item becomes a soft brand pill rather than the
          // default full-width grey bar.
          '&.Mui-selected': {
            backgroundColor: 'rgba(79, 70, 229, 0.10)',
            color: palette.primary.dark,
            '&:hover': { backgroundColor: 'rgba(79, 70, 229, 0.16)' },
            '& .MuiListItemIcon-root': { color: palette.primary.main },
            '& .MuiListItemText-primary': { fontWeight: 600 },
          },
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          // Frosted-glass top bar: a translucent fill with a blur reads as a
          // modern floating header rather than a solid opaque band.
          backgroundColor: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${palette.divider}`,
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(255, 255, 255, 0.78)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: `1px solid ${palette.divider}`,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: 8, fontSize: '0.75rem', backgroundColor: '#1d2939' },
      },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 999, height: 8 }, bar: { borderRadius: 999 } },
    },
  },
});

/** Width of the persistent navigation drawer on desktop. */
export const DRAWER_WIDTH = 264;

export default theme;
