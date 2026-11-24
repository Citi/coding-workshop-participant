"""Foundation behaviour not covered elsewhere: settings, connect arguments, migration rollback, health 503."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.config import ConfigError, _int_env, get_settings
from app.db.migrations import apply_schema
from app.db.session import build_connect_args, build_url, get_db


def test_int_env_rejects_non_integers(monkeypatch: pytest.MonkeyPatch) -> None:
    """A malformed integer setting fails with a clear message."""
    monkeypatch.setenv("BCRYPT_ROUNDS", "ten")
    with pytest.raises(ConfigError, match="BCRYPT_ROUNDS must be an integer"):
        _int_env("BCRYPT_ROUNDS", 10)


def test_int_env_uses_default_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """An unset or blank integer setting falls back to its default."""
    monkeypatch.setenv("ACCESS_TOKEN_MINUTES", "  ")
    assert _int_env("ACCESS_TOKEN_MINUTES", 30) == 30


def test_missing_jwt_secret_fails_fast() -> None:
    """The app refuses to start without a signing secret."""
    with pytest.raises(ConfigError, match="JWT_SECRET is not set"):
        replace(get_settings(), jwt_secret="").require_jwt_secret()


def test_aws_connections_require_tls_and_local_ones_do_not() -> None:
    """Aurora needs sslmode=require; the local database runs without TLS."""
    local = replace(get_settings(), is_local=True, postgres_schema=None)
    aws = replace(get_settings(), is_local=False, postgres_schema=None)
    assert build_connect_args(local) == {"connect_timeout": 30}
    assert build_connect_args(aws) == {"connect_timeout": 30, "sslmode": "require"}


def test_test_schema_sets_search_path() -> None:
    """POSTGRES_SCHEMA (tests only) becomes the connection's search_path."""
    settings = replace(get_settings(), postgres_schema="pip_test_x")
    assert build_connect_args(settings)["options"] == "-csearch_path=pip_test_x"


def test_empty_password_is_omitted_from_the_url() -> None:
    """An unset password is left out of the URL instead of being an empty string."""
    url = build_url(replace(get_settings(), postgres_pass=""))
    assert url.password is None
    assert url.drivername == "postgresql+psycopg"


class _FailingCursor:
    """A cursor whose execute always fails."""

    def __enter__(self) -> _FailingCursor:
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def execute(self, sql: str) -> None:
        """Fail like a broken DDL statement."""
        raise RuntimeError("DDL failed")


class _FakeRawConnection:
    """Records whether the migration committed, rolled back and closed."""

    def __init__(self) -> None:
        self.events: list[str] = []

    def cursor(self) -> _FailingCursor:
        """Return a cursor that fails."""
        return _FailingCursor()

    def commit(self) -> None:
        """Record a commit."""
        self.events.append("commit")

    def rollback(self) -> None:
        """Record a rollback."""
        self.events.append("rollback")

    def close(self) -> None:
        """Record a close."""
        self.events.append("close")


def test_failed_migration_rolls_back_closes_and_raises() -> None:
    """A failing schema.sql is rolled back, the connection is closed and the error propagates."""
    raw = _FakeRawConnection()

    class _Engine:
        def raw_connection(self) -> _FakeRawConnection:
            return raw

    with pytest.raises(RuntimeError, match="DDL failed"):
        apply_schema(_Engine())  # type: ignore[arg-type]
    assert raw.events == ["rollback", "close"]


def test_health_reports_503_when_the_database_is_down(client: TestClient) -> None:
    """When SELECT 1 fails, /health says so with 503 and the standard error fields."""

    class _DownSession:
        def execute(self, *args: Any, **kwargs: Any) -> None:
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    def _down_db() -> Iterator[_DownSession]:
        yield _DownSession()

    client.app.dependency_overrides[get_db] = _down_db
    try:
        response = client.get("/health")
    finally:
        client.app.dependency_overrides.clear()
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"] == "unavailable"
    assert body["error"] == "SERVICE_UNAVAILABLE"
    assert isinstance(body["latency_ms"], float)
