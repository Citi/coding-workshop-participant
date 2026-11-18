"""Password hashing and JWT access tokens."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core import config
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password


def test_hash_is_salted_and_verifies():
    h1, h2 = hash_password("Password123!"), hash_password("Password123!")
    assert h1 != h2 and h1.startswith("$2b$")
    assert verify_password("Password123!", h1)
    assert not verify_password("wrong", h1)


def test_unknown_user_never_verifies():
    assert verify_password("anything", None) is False


def test_token_round_trip():
    claims = decode_access_token(create_access_token(42, "engineer"))
    assert claims["sub"] == "42" and claims["role"] == "engineer"
    lifetime = claims["exp"] - claims["iat"]
    assert lifetime == config.TOKEN_TTL_HOURS * 3600


def test_tampered_token_rejected():
    token = create_access_token(1, "employee")
    forged = jwt.encode({"sub": "1", "role": "facility_admin"}, "other-key", algorithm="HS256")
    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(forged)
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(token[:-2] + "xx")


def test_expired_token_rejected():
    past = datetime.now(timezone.utc) - timedelta(hours=9)
    token = jwt.encode({"sub": "1", "iat": past, "exp": past + timedelta(hours=8)},
                       config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_pool_is_sized_for_the_runtime(monkeypatch):
    """Lambda: 1 request per instance -> tiny pool. Server: one connection per worker thread."""
    import importlib

    monkeypatch.delenv("DB_POOL_SIZE", raising=False)
    monkeypatch.delenv("DB_MAX_OVERFLOW", raising=False)
    try:
        monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "coding-workshop-api-service")
        lam = importlib.reload(config)
        assert (lam.DB_POOL_SIZE, lam.DB_MAX_OVERFLOW) == (1, 1)

        monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME")
        srv = importlib.reload(config)
        assert srv.DB_POOL_SIZE + srv.DB_MAX_OVERFLOW >= 40  # FastAPI's default thread pool
    finally:
        importlib.reload(config)
