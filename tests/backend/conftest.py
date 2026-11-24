"""Shared pytest fixtures for the portfolio service.

Tests run against the local PostgreSQL in a throwaway schema. The environment is
set here, before anything imports the app, because settings and the engine are
created once per process.
"""

from __future__ import annotations

import os
import secrets
from collections.abc import Callable, Iterator
from typing import Any

import pytest

os.environ["POSTGRES_HOST"] = "localhost"
os.environ["POSTGRES_PORT"] = "5432"
os.environ["POSTGRES_NAME"] = "postgres"
os.environ["POSTGRES_USER"] = "postgres"
os.environ["POSTGRES_PASS"] = os.environ.get("POSTGRES_PASS") or "postgres123"
# TEST_POSTGRES_SCHEMA lets parallel runs use separate schemas; the default is pip_test.
os.environ["POSTGRES_SCHEMA"] = os.environ.get("TEST_POSTGRES_SCHEMA") or "pip_test"
os.environ["IS_LOCAL"] = "true"
os.environ["BCRYPT_ROUNDS"] = "4"
os.environ["JWT_SECRET"] = secrets.token_hex(32)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import Engine, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db.migrations import apply_schema  # noqa: E402
from app.db.models import ALL_TABLES  # noqa: E402
from app.db.session import get_engine, get_sessionmaker  # noqa: E402

# A random password per test run: nothing secret is hardcoded.
TEST_PASSWORD = secrets.token_urlsafe(12)


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """Drop and recreate the test schema, then run the migration once per session."""
    schema = os.environ["POSTGRES_SCHEMA"]
    eng = get_engine()
    with eng.connect() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        conn.commit()
    apply_schema(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def clean_db(engine: Engine) -> Engine:
    """Empty every table and reset identities before a test."""
    with engine.connect() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(ALL_TABLES)} RESTART IDENTITY CASCADE"))
        conn.commit()
    return engine


@pytest.fixture
def db_session(clean_db: Engine) -> Iterator[Session]:
    """A session on the clean test schema, closed (and rolled back) after the test."""
    session = get_sessionmaker()()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client(clean_db: Engine) -> Iterator[TestClient]:
    """A TestClient for a fresh app; server errors become 500 responses, not exceptions."""
    from app.main import create_app

    with TestClient(create_app(), raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def make_user(db_session: Session) -> Callable[..., Any]:
    """Factory that inserts a user with a role and returns the ORM object."""
    from app.db.models import User
    from app.security import hash_password

    counter = {"n": 0}

    def _make(
        role: str = "VIEWER",
        *,
        email: str | None = None,
        name: str | None = None,
        password: str = TEST_PASSWORD,
        department_id: int | None = None,
    ) -> User:
        counter["n"] += 1
        user = User(
            name=name or f"{role.title()} User {counter['n']}",
            email=(email or f"{role.lower()}{counter['n']}@test.example").lower(),
            password_hash=hash_password(password),
            role=role,
            department_id=department_id,
        )
        db_session.add(user)
        db_session.commit()
        return user

    return _make


@pytest.fixture
def auth_headers(make_user: Callable[..., Any]) -> Callable[..., dict[str, str]]:
    """Factory returning ``Authorization`` headers for a new user with the given role."""
    from app.security import create_access_token

    def _headers(role: str = "ADMIN", **kwargs: Any) -> dict[str, str]:
        user = make_user(role, **kwargs)
        return {"Authorization": f"Bearer {create_access_token(user)}"}

    return _headers


def function_url_event(
    method: str, path: str, body: str | None = None, headers: dict[str, str] | None = None
) -> dict[str, Any]:
    """Build a Lambda Function URL event (payload format 2.0)."""
    return {
        "version": "2.0", "routeKey": "$default", "rawPath": path, "rawQueryString": "",
        "headers": {"content-type": "application/json", "host": "x.lambda-url.on.aws", **(headers or {})},
        "requestContext": {
            "accountId": "anonymous", "apiId": "x", "domainName": "x.lambda-url.on.aws",
            "http": {"method": method, "path": path, "protocol": "HTTP/1.1", "sourceIp": "127.0.0.1", "userAgent": "pytest"},
            "requestId": "r", "routeKey": "$default", "stage": "$default", "time": "now", "timeEpoch": 1,
        },
        "body": body, "isBase64Encoded": False,
    }


@pytest.fixture(name="function_url_event")
def function_url_event_fixture() -> Callable[..., dict[str, Any]]:
    """Expose ``function_url_event`` as a fixture."""
    return function_url_event
