"""Password hashing (bcrypt) and the password policy for new/changed passwords."""

import re

import bcrypt

from app.core.config import get_settings

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_BYTES = 72  # bcrypt only uses the first 72 bytes (bcrypt>=5 rejects longer input)
_HAS_LETTER = re.compile(r"[A-Za-z]")
_HAS_DIGIT = re.compile(r"[0-9]")


def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def check_password_strength(value: str) -> str:
    """Pydantic-friendly validator: raise ValueError with a user-facing message."""
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Must be at least {PASSWORD_MIN_LENGTH} characters")
    if len(value.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError(f"Must be at most {PASSWORD_MAX_BYTES} bytes")
    if not _HAS_LETTER.search(value) or not _HAS_DIGIT.search(value):
        raise ValueError("Must contain at least one letter and one number")
    return value
