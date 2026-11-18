"""Password hashing (bcrypt) and access tokens (JWT)."""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core import config

# Compared against when an email is unknown, so login timing doesn't reveal it
_DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt(10))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(10)).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    stored = password_hash.encode() if password_hash else _DUMMY_HASH
    ok = bcrypt.checkpw(password.encode()[:72], stored)
    return ok and password_hash is not None


def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=config.TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Raises jwt.InvalidTokenError (incl. ExpiredSignatureError) on failure."""
    return jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM])
