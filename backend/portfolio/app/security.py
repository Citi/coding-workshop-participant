"""Passwords, JSON Web Tokens and the authentication and role dependencies.

* Passwords are hashed with ``bcrypt`` directly (passlib is unmaintained and does
  not work with bcrypt 5). bcrypt accepts at most 72 bytes, so request models
  enforce 8 to 72 UTF-8 bytes before a password reaches this module.
* Tokens are HS256 JWTs signed with ``JWT_SECRET``. Claims: ``sub`` (the user id
  as a string), ``role``, ``typ`` (``access`` or ``refresh``), ``iat`` and ``exp``.
* ``get_current_user`` reads ``Authorization: Bearer <access token>`` and loads the
  user from the database on every request, so a role change or a deleted account
  takes effect immediately, whatever the token says.
* A token issued before its user's account was created is refused. The ``reset``
  task restarts identities, so a user id can later belong to someone else; such
  a token was issued to the old account and must not act as the new one.
* Every 401 uses the standard error body and carries ``WWW-Authenticate: Bearer``.
"""

from __future__ import annotations

import secrets
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

import bcrypt
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.db.models import ROLES, User
from app.db.session import get_db
from app.errors import AccessDenied, Unauthenticated

# Role groups used by routers (spec section 7).
ALL_ROLES: tuple[str, ...] = ROLES
MANAGERS: tuple[str, ...] = ("ADMIN", "PM")
CONTRIBUTORS: tuple[str, ...] = ("ADMIN", "PM", "LEAD")

JWT_ALGORITHM = "HS256"
# Values of the ``typ`` claim.
ACCESS = "access"
REFRESH = "refresh"
# The ``token_type`` returned by login and refresh (OAuth 2 bearer tokens).
BEARER = "bearer"
REQUIRED_CLAIMS = ("sub", "role", "typ", "iat", "exp")

# Largest value a BIGINT identity column can hold.
_MAX_USER_ID = 9_223_372_036_854_775_807

# ``iat`` is in whole seconds from the app's clock and ``users.created_at`` comes
# from the database's clock. A token may predate its account by this much before
# it counts as issued to an earlier account with the same id.
CLOCK_SKEW_SECONDS = 5

_MESSAGES = {
    "missing": (
        "Authentication required: send an 'Authorization: Bearer <access token>' header."
    ),
    "invalid": "The token is not valid. Sign in again.",
    "gone": "The account for this token no longer exists.",
    "expired_access": "The access token has expired. Refresh it or sign in again.",
    "expired_refresh": "The refresh token has expired. Sign in again.",
    "wrong_access": "This endpoint needs an access token, not a refresh token.",
    "wrong_refresh": "This endpoint needs the refresh token from login, not an access token.",
}

_bearer_scheme = HTTPBearer(
    auto_error=False, description="Access token from POST /auth/login."
)


# --- Passwords ---------------------------------------------------------------


def hash_password(password: str) -> str:
    """Return a bcrypt hash of ``password`` using the configured cost factor."""
    salt = bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    """Return True when ``password`` matches ``password_hash``.

    Never raises: anything bcrypt refuses (more than 72 bytes, text that cannot be
    encoded as UTF-8, a malformed hash) is treated as a mismatch.
    """
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    """Return a hash of a random throwaway secret, created once per process."""
    return hash_password(secrets.token_urlsafe(32))


def simulate_password_check(password: str) -> None:
    """Spend the bcrypt work of one failed check, for logins with an unknown email.

    An unknown email then costs as much as a wrong password, so response times do
    not reveal which email addresses have accounts.
    """
    verify_password(password, _dummy_hash())


# --- Tokens ------------------------------------------------------------------


def _issue(user: User, kind: str, lifetime: timedelta) -> str:
    """Sign a token of the given ``typ`` for ``user``."""
    issued_at = datetime.now(timezone.utc)
    claims = {
        "sub": str(user.id),
        "role": user.role,
        "typ": kind,
        "iat": issued_at,
        "exp": issued_at + lifetime,
    }
    return jwt.encode(claims, get_settings().require_jwt_secret(), algorithm=JWT_ALGORITHM)


def access_token_lifetime_seconds() -> int:
    """Return the access-token lifetime in seconds (``expires_in`` of login and refresh)."""
    return get_settings().access_token_minutes * 60


def create_access_token(user: User) -> str:
    """Return a short-lived access token for ``user`` (``ACCESS_TOKEN_MINUTES``, default 30)."""
    return _issue(user, ACCESS, timedelta(minutes=get_settings().access_token_minutes))


def create_refresh_token(user: User) -> str:
    """Return a refresh token for ``user`` (``REFRESH_TOKEN_HOURS``, default 8)."""
    return _issue(user, REFRESH, timedelta(hours=get_settings().refresh_token_hours))


def _user_id(claims: dict[str, Any]) -> int | None:
    """Return the user id in the ``sub`` claim, or None when it is not a valid id."""
    subject = claims.get("sub")
    if isinstance(subject, str) and subject.isascii() and subject.isdigit():
        user_id = int(subject)
        if 1 <= user_id <= _MAX_USER_ID:
            return user_id
    return None


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    """Verify a token's signature, expiry, required claims and ``typ``; return its claims.

    Raises ``Unauthenticated`` when the token is malformed, expired, signed with
    another key or algorithm, missing a claim, or of the wrong type.
    """
    if expected_type not in (ACCESS, REFRESH):
        raise ValueError(f"Unknown token type {expected_type!r}.")
    try:
        claims = jwt.decode(
            token,
            get_settings().require_jwt_secret(),
            algorithms=[JWT_ALGORITHM],
            options={"require": list(REQUIRED_CLAIMS)},
        )
    except jwt.ExpiredSignatureError as exc:
        raise Unauthenticated(_MESSAGES[f"expired_{expected_type}"]) from exc
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise Unauthenticated(_MESSAGES["invalid"]) from exc
    if claims.get("typ") != expected_type:
        raise Unauthenticated(_MESSAGES[f"wrong_{expected_type}"])
    if _user_id(claims) is None:
        raise Unauthenticated(_MESSAGES["invalid"])
    return claims


def unauthenticated(message: str) -> StarletteHTTPException:
    """Build a 401 ``UNAUTHENTICATED`` with a ``WWW-Authenticate: Bearer`` challenge.

    The standard HTTP error handler in ``app.errors`` maps 401 to ``UNAUTHENTICATED``
    and copies the exception's headers onto the response.
    """
    return StarletteHTTPException(
        status_code=401, detail=message, headers={"WWW-Authenticate": "Bearer"}
    )


def _issued_before_account(claims: dict[str, Any], user: User) -> bool:
    """Return True when the token was issued before ``user``'s account was created.

    Such a token belonged to an earlier account with the same id (``reset``
    restarts identities), so it must not act as this one. ``CLOCK_SKEW_SECONDS``
    absorbs a small difference between the app's and the database's clocks.
    """
    issued_at = int(claims["iat"])  # PyJWT has checked it is a number, not in the future
    return issued_at < int(user.created_at.timestamp()) - CLOCK_SKEW_SECONDS


def _user_for_token(db: Session, token: str, expected_type: str) -> User:
    """Decode ``token`` and load its user from the database; raise a 401 otherwise.

    The user must still exist and must not be newer than the token: an id that
    was reused after ``reset`` answers the same "no longer exists" 401 as a
    deleted account.
    """
    try:
        claims = decode_token(token, expected_type)
    except Unauthenticated as exc:
        raise unauthenticated(exc.message) from exc
    user = db.get(User, int(claims["sub"]))  # decode_token has checked it is a valid id
    if user is None or _issued_before_account(claims, user):
        raise unauthenticated(_MESSAGES["gone"])
    return user


def user_from_refresh_token(db: Session, refresh_token: str) -> User:
    """Return the user a refresh token belongs to; 401 if it is invalid or the user is gone."""
    return _user_for_token(db, refresh_token, REFRESH)


# --- Dependencies ------------------------------------------------------------


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency: the signed-in user, loaded fresh from the database.

    Requires ``Authorization: Bearer <access token>``. A refresh token, an expired
    or tampered token, or a token whose account was deleted (or whose id now
    belongs to a newer account) gives 401.
    """
    if credentials is None or not credentials.credentials:
        raise unauthenticated(_MESSAGES["missing"])
    return _user_for_token(db, credentials.credentials, ACCESS)


def _describe_roles(roles: tuple[str, ...]) -> str:
    """Render a role list for messages, for example ``ADMIN or PM``."""
    return roles[0] if len(roles) == 1 else ", ".join(roles[:-1]) + " or " + roles[-1]


def require_roles(*roles: str) -> Callable[..., User]:
    """Build a dependency that admits only signed-in users whose current role is in ``roles``.

    Unauthenticated callers get 401; signed-in callers with another role get 403
    ``ACCESS_DENIED``. The role is read from the database, not from the token.
    """
    unknown = sorted(set(roles) - set(ALL_ROLES))
    if not roles or unknown:
        raise ValueError(f"require_roles() needs one or more of {ALL_ROLES}, got {roles!r}.")
    allowed = tuple(dict.fromkeys(roles))
    needed = _describe_roles(allowed)

    def role_gate(user: User = Depends(get_current_user)) -> User:
        """Return the current user, or raise 403 when their role is not allowed."""
        if user.role not in allowed:
            raise AccessDenied(
                f"This action needs the {needed} role; you are signed in as {user.role}."
            )
        return user

    role_gate.__name__ = "require_" + "_or_".join(role.lower() for role in allowed)
    return role_gate
