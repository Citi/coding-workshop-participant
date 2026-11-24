/**
 * Helpers shared by the dashboard, the projects list and the project detail page:
 * tab addressing, links, the budget-versus-progress wording and risk factor tones.
 */
import { ENTITY_TYPE_LABELS, humanize } from '../../constants.js';
import { formatPct, toNumber } from '../../utils/format.js';

/** Project detail tabs in display order, addressed as `/projects/:id?tab=<value>`. */
export const PROJECT_TABS = Object.freeze([
  Object.freeze({ value: 'overview', label: 'Overview' }),
  Object.freeze({ value: 'deliverables', label: 'Deliverables' }),
  Object.freeze({ value: 'dependencies', label: 'Dependencies' }),
  Object.freeze({ value: 'budget', label: 'Budget' }),
  Object.freeze({ value: 'risk', label: 'Risk' }),
]);

/** Tab shown when the URL names none (or an unknown one). */
export const DEFAULT_PROJECT_TAB = 'overview';

/** Divergence, in percentage points, above which the risk engine starts adding budget points. */
export const DIVERGENCE_ALERT_POINTS = 10;

const TAB_VALUES = new Set(PROJECT_TABS.map((tab) => tab.value));

/**
 * Turn a `?tab=` value into a known tab.
 * @param {string|null|undefined} value - Raw query value.
 * @returns {string} A value from PROJECT_TABS; the default tab for anything unknown.
 */
export function normaliseTab(value) {
  const tab = String(value ?? '').toLowerCase();
  return TAB_VALUES.has(tab) ? tab : DEFAULT_PROJECT_TAB;
}

/**
 * Link to a project's detail page, optionally on one tab.
 * @param {number|string} id - Project id.
 * @param {string} [tab] - Tab value; the default tab needs no query string.
 * @returns {string} Path such as `/projects/1?tab=risk`.
 */
export function projectPath(id, tab) {
  const base = `/projects/${encodeURIComponent(String(id))}`;
  const value = tab ? normaliseTab(tab) : DEFAULT_PROJECT_TAB;
  return value === DEFAULT_PROJECT_TAB ? base : `${base}?tab=${value}`;
}

/**
 * Check that a route parameter is a positive whole number (a record id).
 * @param {string|undefined} value - Route parameter.
 * @returns {boolean} True for ids such as "1" or "42".
 */
export function isRecordId(value) {
  return /^[1-9]\d{0,17}$/.test(String(value ?? ''));
}

/**
 * Round to one decimal, half away from zero (matches the API's rounding of percentages).
 * @param {number} value - Number to round.
 * @returns {number} Rounded number.
 */
export function roundOneDecimal(value) {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 10 + Number.EPSILON)) / 10;
}

/**
 * Percentage points by which spending runs ahead of delivery (utilization minus completion).
 * @param {number|null|undefined} utilizationPct - Budget consumed, in percent (null without a plan).
 * @param {number|null|undefined} completionPct - Mean deliverable completion, in percent.
 * @returns {number|null} Divergence with one decimal, or null when utilization is unknown.
 */
export function divergencePoints(utilizationPct, completionPct) {
  const utilization = toNumber(utilizationPct);
  const completion = toNumber(completionPct) ?? 0;
  if (utilization === null) {
    return null;
  }
  return roundOneDecimal(utilization - completion);
}

/**
 * Describe budget consumption against delivery progress in one sentence (spec 12.4: the
 * divergence stated in words), with an alert severity for how worrying it is.
 * @param {number|null|undefined} utilizationPct - Budget consumed, in percent.
 * @param {number|null|undefined} completionPct - Mean deliverable completion, in percent.
 * @returns {{severity: 'success'|'info'|'warning'|'error', headline: string, detail: string,
 *   divergence: number|null}} Wording and severity.
 */
export function describeDivergence(utilizationPct, completionPct) {
  const divergence = divergencePoints(utilizationPct, completionPct);
  const utilization = toNumber(utilizationPct);
  const completion = toNumber(completionPct) ?? 0;
  if (divergence === null) {
    return {
      severity: 'info',
      headline: 'No planned budget',
      detail: 'This project has no planned budget, so spending cannot be compared with delivery.',
      divergence,
    };
  }
  const facts = `${formatPct(utilization)} of the planned budget is consumed and deliverables are ${formatPct(
    completion,
  )} complete.`;
  if (divergence > 0) {
    let severity = 'info';
    if (utilization > 100) {
      severity = 'error';
    } else if (divergence > DIVERGENCE_ALERT_POINTS) {
      severity = 'warning';
    }
    const overspend = utilization > 100 ? ' Spending has passed the planned budget.' : '';
    return {
      severity,
      headline: `Spending is ${divergence.toFixed(1)} points ahead of delivery`,
      detail: `${facts}${overspend}`,
      divergence,
    };
  }
  if (divergence < 0) {
    return {
      severity: 'success',
      headline: `Delivery is ${Math.abs(divergence).toFixed(1)} points ahead of spending`,
      detail: facts,
      divergence,
    };
  }
  return { severity: 'success', headline: 'Spending and delivery are in step', detail: facts, divergence };
}

/**
 * Tone of a risk factor bar from its share of the factor's maximum.
 * @param {number} points - Points scored.
 * @param {number} maxPoints - Factor maximum.
 * @returns {'none'|'info'|'warning'|'error'} `none` at zero, `error` at the cap.
 */
export function factorTone(points, maxPoints) {
  const scored = toNumber(points) ?? 0;
  const max = toNumber(maxPoints) ?? 0;
  if (max <= 0 || scored <= 0) {
    return 'none';
  }
  const ratio = scored / max;
  if (ratio >= 1) {
    return 'error';
  }
  return ratio >= 0.5 ? 'warning' : 'info';
}

/**
 * Rows for the risk factor chart: the points scored, the headroom left under the factor's
 * cap (drawn as a light track, so each bar's full length is the factor's maximum), a tone for
 * the filled part and the "points / max" label printed after the bar. `labelOn` names the
 * stacked segment that ends at the maximum, so the label sits after the whole bar: the track,
 * or the filled part when the factor is at its cap (a zero-length segment would put the label
 * at the axis origin).
 * @param {Array<{key: string, label: string, points: number, max_points: number, detail?: string}>} factors
 *   RiskFactorOut items in the server's order.
 * @returns {Array<{key: string, label: string, detail: string, points: number, max: number,
 *   filled: number, headroom: number, tone: 'none'|'info'|'warning'|'error', text: string,
 *   labelOn: 'points'|'headroom'|null}>} One row per factor.
 */
export function factorChartRows(factors) {
  return (Array.isArray(factors) ? factors : []).map((factor) => {
    const points = toNumber(factor.points) ?? 0;
    const max = Math.max(0, toNumber(factor.max_points) ?? 0);
    const filled = Math.min(max, Math.max(0, points));
    let labelOn = null;
    if (max - filled > 0) {
      labelOn = 'headroom';
    } else if (filled > 0) {
      labelOn = 'points';
    }
    return {
      key: factor.key,
      label: factor.label,
      detail: factor.detail ?? '',
      points,
      max,
      filled,
      headroom: max - filled,
      tone: factorTone(points, max),
      text: `${points} / ${max}`,
      labelOn,
    };
  });
}

/**
 * Words for a deliverable's distance from the item holding it up.
 * @param {number} depth - Edges from the root cause (1 = direct successor).
 * @returns {string} Text such as "1 step downstream".
 */
export function depthLabel(depth) {
  const steps = toNumber(depth) ?? 0;
  return `${steps} step${steps === 1 ? '' : 's'} downstream`;
}

/**
 * Summarise an audit event for the recent activity list.
 * @param {{entity_type?: string, entity_id?: number|null, action?: string,
 *   before_state?: object|null, after_state?: object|null}} entry - AuditLogOut.
 * @returns {{typeLabel: string, name: string, href: string|null}} Entity type label, a readable
 *   name and a link to the record's page when it still exists.
 */
export function describeAuditEntry(entry) {
  const state = entry?.after_state ?? entry?.before_state ?? {};
  const typeLabel = ENTITY_TYPE_LABELS[entry?.entity_type] ?? (humanize(entry?.entity_type) || 'Record');
  const named = state.project_name ?? state.title ?? state.name ?? null;
  const name = named ? String(named) : `#${entry?.entity_id ?? '?'}`;
  const deleted = entry?.action === 'DELETE';
  let href = null;
  if (!deleted && entry?.entity_type === 'project' && entry?.entity_id) {
    href = projectPath(entry.entity_id);
  } else if (!deleted && entry?.entity_type === 'deliverable' && state.project_id) {
    href = projectPath(state.project_id, 'deliverables');
  } else if (!deleted && entry?.entity_type === 'budget_entry' && state.project_id) {
    href = projectPath(state.project_id, 'budget');
  }
  return { typeLabel, name, href };
}
