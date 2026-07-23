import { cloneElement, isValidElement } from 'react';
import { Tooltip } from '@mui/material';
import useAuth from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../utils/constants';

/**
 * Shows, hides or disables its children based on the current role.
 *
 * Two modes, and the choice matters for usability:
 *
 *   hide (default) -- not rendered at all. Right for nav entries that would
 *     only dead-end, and for actions the user should not know exist.
 *
 *   disable -- rendered greyed out with a tooltip explaining why. Right for a
 *     Delete button in a table an Employee can otherwise use: hiding it makes
 *     the row layout shift between roles and leaves the user wondering where
 *     the action went.
 *
 * Presentation only. The API authorises every request independently, so a
 * user who forces the control still gets a 403.
 *
 * @param {string}   [action]  key from ACTIONS, checked via can()
 * @param {string[]} [roles]   explicit role allow-list
 * @param {'hide'|'disable'} [mode='hide']
 * @param {React.ReactNode} [fallback=null] rendered instead when denied + hide
 * @param {string} [reason] overrides the tooltip text in disable mode
 */
export default function RoleGate({
  action,
  roles,
  mode = 'hide',
  fallback = null,
  reason,
  children,
}) {
  const { can, hasRole, role } = useAuth();

  // An unconstrained gate permits: it is a passthrough, not a lockout.
  const allowedByAction = action ? Boolean(can(action)) : true;
  const allowedByRole = roles?.length ? hasRole(roles) : true;
  const allowed = allowedByAction && allowedByRole;

  if (allowed) return children;

  if (mode === 'disable' && isValidElement(children)) {
    const message = reason ?? `${ROLE_LABELS[role] ?? role} cannot perform this action`;
    return (
      // A disabled MUI control emits no pointer events, so the tooltip needs a
      // wrapper element to listen on -- hence the span.
      <Tooltip title={message}>
        <span style={{ display: 'inline-flex' }}>
          {cloneElement(children, { disabled: true })}
        </span>
      </Tooltip>
    );
  }

  return fallback;
}
