"""
Password hashing, JWT issue/verify, and the RBAC check.

Authentication first, authorization second: `authenticate()` establishes who
the caller is, `require_permission()` decides what they may do. Both live here
so every service applies identical rules -- a permission table that drifts
between services is a privilege-escalation bug waiting to happen.
"""

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

logger = logging.getLogger()

ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(minutes=30)
REFRESH_TOKEN_TTL = timedelta(days=7)

# Roles, matching the `roles` table seeded in schema.sql.
ADMIN = "ADMIN"
PROJECT_MANAGER = "PROJECT_MANAGER"
TEAM_LEADER = "TEAM_LEADER"
EMPLOYEE = "EMPLOYEE"
STAKEHOLDER = "STAKEHOLDER"

ROLES = (ADMIN, PROJECT_MANAGER, TEAM_LEADER, EMPLOYEE, STAKEHOLDER)

# Scope markers. A permission is either a plain bool, or one of these when the
# role may perform the action but only over a subset of the rows.
#
# ASSIGNED -- only projects the user is assigned to
# TEAM     -- only the team the user leads
# OWN      -- only the user's own records
#
# They are truthy on purpose: `if can(role, action)` answers "may they do this
# at all", and the caller narrows the rows separately via `scope_of()`.
ASSIGNED = "assigned"
TEAM = "team"
OWN = "own"

# The permission matrix. The frontend mirrors it to hide controls, but this
# copy is the one that actually decides -- every request is re-checked here
# regardless of what the UI chose to render.
PERMISSIONS = {
    ADMIN: {
        "view_dashboard": True,
        "view_projects": True,
        "create_projects": True,
        "edit_projects": True,
        "delete_projects": True,
        "manage_deliverables": True,
        "update_deliverables": True,
        "assign_employees": True,
        "view_allocation": True,
        "view_budgets": True,
        "manage_budgets": True,
        "manage_users": True,
        "generate_reports": True,
    },
    PROJECT_MANAGER: {
        "view_dashboard": True,
        "view_projects": True,
        "create_projects": True,
        "edit_projects": True,
        "delete_projects": True,
        "manage_deliverables": True,
        "update_deliverables": True,
        "assign_employees": True,
        "view_allocation": True,
        "view_budgets": True,
        "manage_budgets": True,
        # The one thing a PM may not do: create users or change roles.
        "manage_users": False,
        "generate_reports": True,
    },
    TEAM_LEADER: {
        "view_dashboard": True,
        "view_projects": True,
        "create_projects": False,
        "edit_projects": ASSIGNED,
        "delete_projects": False,
        "manage_deliverables": True,
        "update_deliverables": True,
        "assign_employees": True,
        "view_allocation": TEAM,
        # Budgets are visible but not editable.
        "view_budgets": True,
        "manage_budgets": False,
        "manage_users": False,
        "generate_reports": TEAM,
    },
    EMPLOYEE: {
        "view_dashboard": OWN,
        "view_projects": ASSIGNED,
        "create_projects": False,
        "edit_projects": False,
        "delete_projects": False,
        # May update the deliverables assigned to them, but not create or
        # delete: those stay with the Team Leader.
        "manage_deliverables": False,
        "update_deliverables": ASSIGNED,
        "assign_employees": False,
        "view_allocation": OWN,
        "view_budgets": False,
        "manage_budgets": False,
        "manage_users": False,
        "generate_reports": False,
    },
    STAKEHOLDER: {
        "view_dashboard": True,
        "view_projects": True,
        "create_projects": False,
        "edit_projects": False,
        "delete_projects": False,
        "manage_deliverables": False,
        "update_deliverables": False,
        "assign_employees": False,
        "view_allocation": True,
        "view_budgets": True,
        "manage_budgets": False,
        "manage_users": False,
        "generate_reports": True,
    },
}

# Actions that are reads. Used by the generic read guard so every role that can
# see a screen keeps seeing it without listing each action at every call site.
READ_ACTIONS = ("view_dashboard", "view_projects", "view_allocation", "generate_reports")


class AuthError(Exception):
    """Raised for anything that should become a 401 or 403.

    `status` distinguishes the two: 401 means "we do not know who you are",
    403 means "we know, and you may not do this".
    """

    def __init__(self, message, status=401):
        super().__init__(message)
        self.message = message
        self.status = status


def _secret():
    """The JWT signing key.

    Prefers an explicit JWT_SECRET. The workshop's Terraform passes a fixed set
    of env vars and does not include one, so as a fallback the key is derived
    from the participant-specific APP_ID/APP_NAME that Terraform does inject.

    TRADE-OFF: that fallback is derived from non-secret values. It is stable
    across deploys (tokens survive a redeploy) and differs per participant, but
    a real deployment should set JWT_SECRET from Secrets Manager. Setting the
    env var is the only change needed -- no code change.
    """
    explicit = os.getenv("JWT_SECRET")
    if explicit:
        return explicit

    seed = f"{os.getenv('APP_NAME', 'coding-workshop')}:{os.getenv('APP_ID', 'local')}"
    logger.warning("JWT_SECRET is not set; deriving a signing key from APP_ID/APP_NAME")
    return hashlib.sha256(seed.encode()).hexdigest()


# -- Passwords --------------------------------------------------------------


def hash_password(plaintext):
    """bcrypt hash, cost 12. Never store or log the plaintext."""
    return bcrypt.hashpw(plaintext.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plaintext, password_hash):
    """Constant-time comparison via bcrypt; False on a malformed stored hash."""
    try:
        return bcrypt.checkpw(plaintext.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# -- Tokens -----------------------------------------------------------------


def _issue(user, token_type, ttl):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "type": token_type,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def create_access_token(user):
    return _issue(user, "access", ACCESS_TOKEN_TTL)


def create_refresh_token(user):
    return _issue(user, "refresh", REFRESH_TOKEN_TTL)


def decode_token(token, expected_type="access"):
    """Verifies signature and expiry, and that the token is the right kind.

    The type check matters: a refresh token is long-lived, so accepting one as
    an access token would silently extend the access window to seven days.
    """
    try:
        claims = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Token has expired", 401) from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Invalid token", 401) from exc

    if claims.get("type") != expected_type:
        raise AuthError(f"Expected a {expected_type} token", 401)

    return claims


# -- Request-level helpers --------------------------------------------------


def bearer_token(event):
    """Pulls the token out of the Authorization header.

    Header names arrive lowercased through Lambda Function URLs, but the check
    is case-insensitive because CloudFront and the local proxy differ.
    """
    headers = event.get("headers") or {}
    raw = None
    for key, value in headers.items():
        if key.lower() == "authorization":
            raw = value
            break

    if not raw:
        raise AuthError("Authorization header is missing", 401)

    parts = raw.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthError("Authorization header must be 'Bearer <token>'", 401)

    return parts[1]


def authenticate(event):
    """Returns the caller's claims, or raises AuthError.

    Call this at the top of every protected route -- it is the middleware the
    guide asks for, expressed as a function because Lambda has no middleware
    chain to hook into.
    """
    return decode_token(bearer_token(event), expected_type="access")


def can(role, action):
    """Whether `role` may perform `action` at all.

    Returns the raw matrix entry: True, False, or a scope marker. A scope
    marker is truthy, so this answers "permitted in principle"; use scope_of()
    to find out which rows.
    """
    return PERMISSIONS.get(role, {}).get(action, False)


def scope_of(claims, action):
    """How widely the caller may apply `action`.

    Returns None for unrestricted, or one of ASSIGNED / TEAM / OWN when the
    role is limited to a subset of rows. Callers narrow their query with it:

        scope = scope_of(claims, "view_projects")
        if scope == ASSIGNED:
            rows = service.list_projects(assigned_to=claims["sub"])
    """
    permission = can(claims.get("role"), action)
    return permission if isinstance(permission, str) else None


def require_permission(claims, action):
    """Raises AuthError(403) unless the caller's role permits `action`.

    An unknown role is denied rather than defaulted: if the roles table gains
    an entry this table does not know about, the safe answer is no.

    A scope-limited permission passes here -- it means "yes, but only over
    certain rows", and narrowing those rows is the caller's job via scope_of().
    """
    role = claims.get("role")
    if not can(role, action):
        raise AuthError(f"Role '{role}' may not {action.replace('_', ' ')}", 403)
    return True


def require_any(claims, *actions):
    """Passes if the caller holds at least one of `actions`.

    Useful on read endpoints several roles reach for different reasons.
    """
    role = claims.get("role")
    if not any(can(role, action) for action in actions):
        raise AuthError("Your role does not permit this action", 403)
    return True


def require_role(claims, *roles):
    """Raises AuthError(403) unless the caller holds one of `roles`."""
    if claims.get("role") not in roles:
        raise AuthError("Your role does not permit this action", 403)
    return True
