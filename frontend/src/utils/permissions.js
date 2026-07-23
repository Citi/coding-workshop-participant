import { PERMISSIONS, SCOPES } from './constants';

/**
 * Role checks shared by RoleGate, the navigation and the route guards.
 *
 * Mirrors backend/_shared/auth.py. Presentation only: it decides whether a
 * control is rendered, never whether an operation is allowed. The API
 * re-checks every request regardless of what the UI chose to show.
 */

/**
 * Whether `role` may perform `action` at all.
 *
 * Returns the raw matrix entry: true, false, or a scope string. Scope strings
 * are truthy, so this answers "permitted in principle".
 */
export function can(role, action) {
  return PERMISSIONS[role]?.[action] ?? false;
}

/**
 * How widely `role` may apply `action`.
 *
 * @returns {'assigned'|'team'|'own'|null} null when unrestricted.
 */
export function scopeOf(role, action) {
  const permission = can(role, action);
  return typeof permission === 'string' ? permission : null;
}

/** True when the permission exists but is limited to a subset of rows. */
export function isScoped(role, action) {
  return scopeOf(role, action) !== null;
}

/** True if `role` holds at least one of `actions`. */
export function canAny(role, ...actions) {
  return actions.flat().some((action) => can(role, action));
}

/**
 * A short phrase explaining a scope, for tooltips and empty states.
 * Returns null when the action is unrestricted or not permitted.
 */
export function scopeLabel(role, action) {
  switch (scopeOf(role, action)) {
    case SCOPES.ASSIGNED:
      return 'limited to projects you are assigned to';
    case SCOPES.TEAM:
      return 'limited to your team';
    case SCOPES.OWN:
      return 'limited to your own records';
    default:
      return null;
  }
}
