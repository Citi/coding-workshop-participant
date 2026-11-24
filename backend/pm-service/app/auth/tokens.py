"""JWT access/refresh tokens (HS256). Access tokens are short-lived; refresh tokens
let the frontend obtain a new access token without asking for the password again."""

from datetime import timedelta

import jwt

from app.core import clock
from app.core.config import get_settings
from app.core.errors import UnauthorizedError

ALGORITHM = "HS256"
ISSUER = "acme-project-tracker"
ACCESS = "access"
REFRESH = "refresh"


def create_token(user: dict, token_type: str, ttl: timedelta) -> str:
    issued_at = clock.now()
    payload = {
        "sub": str(user["id"]),
        "role": user["role"],
        "type": token_type,
        "iss": ISSUER,
        "iat": issued_at,
        "exp": issued_at + ttl,
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGORITHM)


def create_access_token(user: dict) -> str:
    return create_token(user, ACCESS, timedelta(minutes=get_settings().access_token_minutes))


def create_refresh_token(user: dict) -> str:
    return create_token(user, REFRESH, timedelta(days=get_settings().refresh_token_days))


def decode_token(token: str, expected_type: str) -> dict:
    """Validate signature, expiry, issuer and type; raise 401 with a specific code otherwise."""
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[ALGORITHM],
            issuer=ISSUER,
            options={"require": ["exp", "iat", "sub", "type"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Your session has expired, please log in again", code="TOKEN_EXPIRED") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid authentication token", code="INVALID_TOKEN") from exc
    if payload.get("type") != expected_type or not str(payload.get("sub", "")).isdigit():
        raise UnauthorizedError("Invalid authentication token", code="INVALID_TOKEN")
    return payload
