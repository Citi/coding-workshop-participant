"""
Password hashing and JWT token helpers.

Passwords use PBKDF2-HMAC-SHA256 from the standard library (no native
dependencies to build for Lambda). Tokens are HS256 JWTs signed with a
per-deployment secret.
"""

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from . import config
from .errors import AuthenticationError

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 120_000


def hash_password(password: str) -> str:
    """Hash a password as ``pbkdf2_sha256$iterations$salt$hash``."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return "$".join([
        _ALGORITHM,
        str(_ITERATIONS),
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    ])


def verify_password(password: str, stored: str) -> bool:
    """Check a password against a stored hash using a constant-time comparison."""
    try:
        algorithm, iterations, salt_b64, hash_b64 = stored.split("$")
        if algorithm != _ALGORITHM:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _issue(user: dict, token_type: str, lifetime: timedelta) -> str:
    """Sign a token of the given type for a user."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "role": user["role"],
        "type": token_type,
        "iat": now,
        "exp": now + lifetime,
    }
    return jwt.encode(payload, config.jwt_secret(), algorithm="HS256")


def issue_tokens(user: dict) -> dict[str, Any]:
    """Return a fresh access + refresh token pair for a user."""
    return {
        "access_token": _issue(user, "access", timedelta(minutes=config.ACCESS_TOKEN_MINUTES)),
        "refresh_token": _issue(user, "refresh", timedelta(days=config.REFRESH_TOKEN_DAYS)),
        "token_type": "Bearer",  # token type label, not a secret  # nosec B105
        "expires_in": config.ACCESS_TOKEN_MINUTES * 60,
    }


def decode_token(token: str, expected_type: str) -> int:
    """Validate a token and return the user id it was issued to."""
    try:
        payload = jwt.decode(token, config.jwt_secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Your session has expired. Please sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError("Invalid authentication token.") from exc
    if payload.get("type") != expected_type:
        raise AuthenticationError("Invalid authentication token.")
    try:
        return int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise AuthenticationError("Invalid authentication token.") from exc
