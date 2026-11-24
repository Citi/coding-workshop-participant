/**
 * Helpers for the budget page: divergence in words, chart series colours and short labels.
 */

/**
 * Divergence above which the risk engine adds budget points (spec section 9.4:
 * divergence > 10 pp scores `round((divergence - 10) * 0.5)`).
 */
export const DIVERGENCE_RISK_THRESHOLD = 10;

/**
 * Series colours for the budget charts: slots 1 (blue) and 2 (orange) of the dataviz
 * reference palette. The theme's primary and secondary colours fall outside the chart
 * lightness and chroma bands; these two pass every check of the palette validator on a
 * white surface (worst colour-blind ΔE 24.7, normal-vision ΔE 33.6, both at least 3:1).
 * Spend is always orange, so "spent" and "budget used" read as the same thing in both charts.
 */
export const SERIES_COLORS = Object.freeze({
  plan: '#2a78d6',
  spend: '#eb6834',
});

/**
 * Utilization minus completion in percentage points, rounded to one decimal.
 * @param {number|null|undefined} utilization - Budget used, in percent (null without a plan).
 * @param {number|null|undefined} completion - Work completed, in percent.
 * @returns {number|null} Divergence, or null when either value is missing.
 */
export function divergenceOf(utilization, completion) {
  if (typeof utilization !== 'number' || typeof completion !== 'number') {
    return null;
  }
  return Math.round((utilization - completion) * 10) / 10;
}

/**
 * Format a divergence as signed points, e.g. "+40.0 pts" or "−5.0 pts".
 * @param {number|null|undefined} value - Divergence in percentage points.
 * @returns {string} Signed points, or an em dash when missing.
 */
export function formatPoints(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  let sign = '';
  if (value > 0) {
    sign = '+';
  } else if (value < 0) {
    sign = '−';
  }
  return `${sign}${Math.abs(value).toFixed(1)} pts`;
}

/**
 * Say in words what a divergence means for a project or department.
 * @param {number|null|undefined} value - Utilization minus completion, in points.
 * @returns {string} Plain-language reading of the number.
 */
export function divergenceWords(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'No planned budget to compare against';
  }
  if (value > DIVERGENCE_RISK_THRESHOLD) {
    return 'Spending well ahead of progress';
  }
  if (value > 0) {
    return 'Spending slightly ahead of progress';
  }
  if (value < 0) {
    return 'Progress ahead of spending';
  }
  return 'Spending in line with progress';
}

/**
 * Short chart label for a project: the part before the colon ("Project Alpha").
 * @param {string} name - Full project name.
 * @returns {string} Short name, or the full name when it has no colon.
 */
export function shortProjectName(name) {
  const short = String(name ?? '').split(':')[0].trim();
  return short || String(name ?? '');
}
