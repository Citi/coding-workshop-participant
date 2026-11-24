/**
 * MUI theme for the platform. Risk and status colours are defined here once;
 * chips, charts and legends read them from these constants.
 */
import { createTheme, responsiveFontSizes } from '@mui/material/styles';

/**
 * Risk level colours (spec section 9.4 levels). Text on each colour meets
 * WCAG AA contrast because the palette uses `contrastThreshold: 4.5`.
 */
export const RISK_COLORS = Object.freeze({
  LOW: '#2e7d32',
  MEDIUM: '#f9a825',
  HIGH: '#ef6c00',
  CRITICAL: '#c62828',
});

/** Theme palette key holding each risk level's colour (usable as a Chip `color`). */
export const RISK_PALETTE_KEYS = Object.freeze({
  LOW: 'riskLow',
  MEDIUM: 'riskMedium',
  HIGH: 'riskHigh',
  CRITICAL: 'riskCritical',
});

/**
 * MUI colour for every status value: project, deliverable, capacity and audit action.
 * `default` renders as a neutral outlined chip.
 */
export const STATUS_COLORS = Object.freeze({
  PLANNED: 'info',
  ACTIVE: 'primary',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'default',
  NOT_STARTED: 'default',
  IN_PROGRESS: 'info',
  BLOCKED: 'error',
  DONE: 'success',
  OVER_ALLOCATED: 'error',
  FULLY_ALLOCATED: 'warning',
  AVAILABLE: 'success',
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'error',
});

/** Colour for dependency root causes (spec 12.4: the error colour). */
export const ROOT_CAUSE_COLOR = 'error';

/** Colour for deliverables impacted by a root cause (spec 12.4: the warning colour). */
export const IMPACTED_COLOR = 'warning';

/** Neutral colour for charts when a value has no assigned colour. */
const NEUTRAL_COLOR = '#757575';

const baseTheme = createTheme({
  palette: {
    contrastThreshold: 4.5,
    primary: { main: '#1f4e8c' },
    secondary: { main: '#00796b' },
    background: { default: '#f4f6f9', paper: '#ffffff' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: [
      'system-ui',
      '-apple-system',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    button: { textTransform: 'none', fontWeight: 600 },
  },
});

/** The application theme: base palette plus one palette entry per risk level. */
const theme = responsiveFontSizes(
  createTheme(baseTheme, {
    palette: Object.fromEntries(
      Object.entries(RISK_PALETTE_KEYS).map(([level, key]) => [
        key,
        baseTheme.palette.augmentColor({ color: { main: RISK_COLORS[level] }, name: key }),
      ]),
    ),
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiChip: { styleOverrides: { label: { fontWeight: 600 } } },
      MuiTableCell: { styleOverrides: { head: { fontWeight: 600 } } },
    },
  }),
);

/**
 * Hex colour for a risk level, for charts and legends.
 * @param {string} level - LOW, MEDIUM, HIGH or CRITICAL.
 * @returns {string} Hex colour; neutral grey for unknown levels.
 */
export function riskColor(level) {
  return RISK_COLORS[level] ?? NEUTRAL_COLOR;
}

/**
 * Hex colour for a status value, for charts and legends.
 * @param {string} status - Any key of STATUS_COLORS.
 * @param {import('@mui/material/styles').Theme} [activeTheme] - Theme to read from.
 * @returns {string} Hex colour; neutral grey for `default` or unknown values.
 */
export function statusColor(status, activeTheme = theme) {
  const key = STATUS_COLORS[status];
  if (!key || key === 'default') {
    return NEUTRAL_COLOR;
  }
  return activeTheme.palette[key].main;
}

export default theme;
