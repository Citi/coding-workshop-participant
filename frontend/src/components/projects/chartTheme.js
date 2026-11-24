/**
 * Chart settings shared by the project charts (all drawn with @mui/x-charts).
 *
 * Planned and spent budget are one hue in two steps: the theme's primary blue for spend and
 * a lighter step of the same blue for the plan. The pair was checked with the dataviz
 * palette validator as an ordinal ramp (monotone lightness, visible step, 2.9:1 light end).
 */

/** Lighter step of the primary blue, used for planned budget next to spend. */
export const PLANNED_BUDGET_COLOR = '#5598e7';

/** Bar corner radius in pixels (rounded data end). */
export const BAR_RADIUS = 4;

/** Share of each band left empty around a bar, which keeps bars thin. */
export const BAND_GAP_RATIO = 0.45;

/**
 * Shared label style for axis tick text, read from the theme's text colours.
 * @param {import('@mui/material/styles').Theme} theme - Active theme.
 * @returns {object} Style for `tickLabelStyle`.
 */
export function tickLabelStyle(theme) {
  return { fontSize: 12, fill: theme.palette.text.secondary };
}

/**
 * Highest axis value with headroom for labels printed past the end of the longest bar.
 * @param {number[]} values - Plotted values.
 * @param {number} [minimum] - Smallest maximum to use (keeps empty charts readable).
 * @returns {number} Axis maximum.
 */
export function axisMaxWithHeadroom(values, minimum = 1) {
  const largest = Math.max(minimum, ...values.filter((value) => Number.isFinite(value)));
  return largest * 1.15;
}
