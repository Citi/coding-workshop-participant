"""
HTTP handlers for the auth service.

Each function takes the Lambda event (plus any path params) and returns a
response dict. Errors are raised, not returned -- the Router converts
AuthError and ValidationError into the right status codes in one place.
"""

import logging

import models
import service
from _shared.auth import (
    ADMIN,
    AuthError,
    authenticate,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    require_permission,
    verify_password,
)
from _shared.responses import created, no_content, not_found, ok
from _shared.validation import ValidationError, parse_body, validate

logger = logging.getLogger()

# The role a signup receives is derived from the email address -- see
# models.role_for_email. ADMIN is deliberately not reachable that way: it is
# granted only to the very first account (so a fresh deployment has someone who
# can manage users) or by an existing Admin.


def _token_pair(user):
    """Builds the payload returned by login, register and refresh."""
    claims_source = {"id": user["id"], "email": user["email"], "role": user["role"]}
    return {
        "accessToken": create_access_token(claims_source),
        "refreshToken": create_refresh_token(claims_source),
        "user": models.serialise_user(user),
    }


# -- Public endpoints -------------------------------------------------------


def register(event):
    """Self-service signup.

    The very first account becomes an Admin so a fresh deployment has someone
    who can manage users. After that the role comes from the email address:
    ada.mr@acme.com is a Project Manager, ada.tl@acme.com a Team Leader, any
    other @acme.com address an Employee, and anything else a read-only
    Stakeholder.
    """
    data = validate(parse_body(event), models.REGISTER_SPEC)

    if service.find_by_email(data["email"]):
        # Deliberately explicit: the address is already discoverable via the
        # login form, so refusing to say why would frustrate without adding
        # any real protection.
        raise ValidationError({"email": "That email address is already registered"})

    role = ADMIN if service.count_users() == 0 else models.role_for_email(data["email"])

    inserted = service.create_user(
        email=data["email"],
        password_hash=hash_password(data["password"]),
        full_name=data["fullName"],
        role=role,
    )

    user = service.find_by_id(inserted["id"])
    logger.info("Registered user %s with role %s", user["email"], role)
    return created(_token_pair(user))


def login(event):
    """Exchanges credentials for a token pair."""
    data = validate(parse_body(event), models.LOGIN_SPEC)

    user = service.find_by_email(data["email"])

    # One message and one code path for "no such user" and "wrong password",
    # so the response cannot be used to enumerate registered addresses.
    if not user or not verify_password(data["password"], user["password_hash"]):
        logger.info("Failed login attempt for %s", data["email"])
        raise AuthError("Incorrect email or password", 401)

    if not user["is_active"]:
        raise AuthError("This account has been deactivated", 403)

    return ok(_token_pair(user))


def refresh(event):
    """Rotates an unexpired refresh token into a new pair."""
    data = validate(parse_body(event), models.REFRESH_SPEC)

    claims = decode_token(data["refreshToken"], expected_type="refresh")

    # Re-read the user rather than trusting the token's copy of the role: a
    # demotion or deactivation must take effect on the next refresh, not seven
    # days later when the refresh token finally expires.
    user = service.find_by_id(claims["sub"])
    if not user:
        raise AuthError("Account no longer exists", 401)
    if not user["is_active"]:
        raise AuthError("This account has been deactivated", 403)

    return ok(_token_pair(user))


def logout(event):
    """Ends the session.

    Tokens are stateless and self-expiring, so there is nothing server-side to
    revoke without a denylist table. The client discards both tokens; this
    endpoint exists so that remains an explicit, logged action.

    TRADE-OFF: an already-issued access token stays valid until it expires
    (30 minutes). A denylist keyed on the token's jti would close that window.
    """
    logger.info("Logout requested")
    return no_content()


# -- Authenticated endpoints ------------------------------------------------


def me(event):
    """Resolves the caller's token into their current user record."""
    claims = authenticate(event)

    user = service.find_by_id(claims["sub"])
    if not user:
        raise AuthError("Account no longer exists", 401)

    return ok(models.serialise_user(user))


def change_password(event):
    """Changes the caller's own password after re-checking the current one."""
    claims = authenticate(event)
    data = validate(parse_body(event), models.CHANGE_PASSWORD_SPEC)

    user = service.find_by_id(claims["sub"])
    if not user or not verify_password(data["currentPassword"], user["password_hash"]):
        raise AuthError("Your current password is incorrect", 401)

    service.update_password(user["id"], hash_password(data["newPassword"]))
    return no_content()


# -- User administration (Admin only) ---------------------------------------


def list_users(event):
    claims = authenticate(event)
    require_permission(claims, "manage_users")

    params = event.get("queryStringParameters") or {}
    rows = service.list_users(search=params.get("search"), role=params.get("role"))
    return ok([models.serialise_user(row) for row in rows])


def get_user(event, id):
    claims = authenticate(event)
    require_permission(claims, "manage_users")

    user = service.find_by_id(id)
    if not user:
        return not_found("User not found")

    return ok(models.serialise_user(user))


def create_user(event):
    claims = authenticate(event)
    require_permission(claims, "manage_users")

    data = validate(parse_body(event), models.CREATE_USER_SPEC)

    if service.find_by_email(data["email"]):
        raise ValidationError({"email": "That email address is already registered"})

    inserted = service.create_user(
        email=data["email"],
        password_hash=hash_password(data["password"]),
        full_name=data["fullName"],
        role=data["role"],
    )
    return created(models.serialise_user(service.find_by_id(inserted["id"])))


def update_user(event, id):
    claims = authenticate(event)
    require_permission(claims, "manage_users")

    data = validate(parse_body(event), models.UPDATE_USER_SPEC, partial=True)

    existing = service.find_by_id(id)
    if not existing:
        return not_found("User not found")

    _guard_last_admin(existing, data)

    updated = service.update_user(
        id,
        full_name=data.get("fullName"),
        role=data.get("role"),
        is_active=data.get("isActive"),
    )
    return ok(models.serialise_user(updated))


def update_role(event, id):
    """Role-only change -- the common admin action, kept as its own endpoint."""
    claims = authenticate(event)
    require_permission(claims, "manage_users")

    data = validate(parse_body(event), models.UPDATE_ROLE_SPEC)

    existing = service.find_by_id(id)
    if not existing:
        return not_found("User not found")

    _guard_last_admin(existing, data)

    return ok(models.serialise_user(service.update_user(id, role=data["role"])))


def delete_user(event, id):
    claims = authenticate(event)
    require_permission(claims, "manage_users")

    if str(claims["sub"]) == str(id):
        raise AuthError("You cannot delete your own account", 403)

    existing = service.find_by_id(id)
    if not existing:
        return not_found("User not found")

    _guard_last_admin(existing, {"isActive": False})

    service.delete_user(id)
    return no_content()


def _guard_last_admin(existing, changes):
    """Blocks a change that would leave no active Admin.

    Without this an Admin can demote or deactivate themselves while being the
    only one, locking user management out of the system permanently.
    """
    if existing["role"] != ADMIN:
        return

    demoting = changes.get("role") is not None and changes["role"] != ADMIN
    deactivating = changes.get("isActive") is False

    if (demoting or deactivating) and service.count_admins(exclude_id=existing["id"]) == 0:
        raise AuthError("There must be at least one active Admin", 403)
