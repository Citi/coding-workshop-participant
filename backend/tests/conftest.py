"""
Shared pytest fixtures.

Integration tests run the real Lambda handler against a real PostgreSQL
database. Point them at any server with TEST_POSTGRES_* variables
(defaults: localhost:5432, user postgres / postgres123 - the workshop's local DB).
A dedicated ``tracker_test`` database is recreated for every test session.
"""

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

import pytest

SERVICE_DIR = Path(__file__).resolve().parents[1] / "tracker"
sys.path.insert(0, str(SERVICE_DIR))

PG = {
    "host": os.getenv("TEST_POSTGRES_HOST", "localhost"),
    "port": os.getenv("TEST_POSTGRES_PORT", "5432"),
    "user": os.getenv("TEST_POSTGRES_USER", "postgres"),
    "password": os.getenv("TEST_POSTGRES_PASS", "postgres123"),
}
TEST_DB = "tracker_test"

os.environ.update({
    "IS_LOCAL": "true",
    "POSTGRES_HOST": PG["host"],
    "POSTGRES_PORT": PG["port"],
    "POSTGRES_USER": PG["user"],
    "POSTGRES_PASS": PG["password"],
    "POSTGRES_NAME": TEST_DB,
    "JWT_SECRET": "test-secret-with-enough-length-for-hs256",
})


def _admin_dsn() -> str:
    from psycopg.conninfo import make_conninfo

    return make_conninfo(host=PG["host"], port=PG["port"], user=PG["user"],
                         password=PG["password"], dbname="postgres", connect_timeout=5)


@pytest.fixture(scope="session")
def database() -> None:
    """Create a clean test database once per session (skips if Postgres is unreachable)."""
    from psycopg import connect

    try:
        with connect(_admin_dsn(), autocommit=True) as conn:
            conn.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
            conn.execute(f"CREATE DATABASE {TEST_DB}")
    except Exception as exc:  # pragma: no cover - environment dependent
        pytest.skip(f"PostgreSQL not available for integration tests: {exc}")


@pytest.fixture()
def fresh_db(database: None) -> None:
    """Drop all tables so each test starts from the seeded demo data."""
    from app import db, schema

    conn = db.get_connection()
    with conn.transaction():
        conn.execute("DROP TABLE IF EXISTS time_entries, milestone_members, milestones, "
                     "project_members, projects, users CASCADE")
    schema.reset_schema_flag()
    schema.ensure_schema(conn)


class ApiClient:
    """Calls the Lambda handler with Function URL-shaped events."""

    def __init__(self) -> None:
        """Create an anonymous client."""
        self.token: Optional[str] = None
        self.user: Optional[dict] = None

    def request(self, method: str, path: str, body: Any = None, query: Optional[dict] = None,
                prefix: str = "") -> tuple[int, Any]:
        """Send a request and return (status, parsed JSON body)."""
        from function import handler

        headers = {"content-type": "application/json"}
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        event = {
            "rawPath": prefix + path,
            "requestContext": {"http": {"method": method}},
            "headers": headers,
            "queryStringParameters": query,
            "body": json.dumps(body) if body is not None else None,
        }
        response = handler(event)
        payload = json.loads(response["body"]) if response.get("body") else None
        return response["statusCode"], payload

    def get(self, path: str, **kw: Any) -> tuple[int, Any]:
        """GET helper."""
        return self.request("GET", path, **kw)

    def post(self, path: str, body: Any = None, **kw: Any) -> tuple[int, Any]:
        """POST helper."""
        return self.request("POST", path, body, **kw)

    def put(self, path: str, body: Any = None, **kw: Any) -> tuple[int, Any]:
        """PUT helper."""
        return self.request("PUT", path, body, **kw)

    def delete(self, path: str, **kw: Any) -> tuple[int, Any]:
        """DELETE helper."""
        return self.request("DELETE", path, **kw)

    def login(self, username: str, password: str) -> "ApiClient":
        """Authenticate and keep the access token."""
        status, body = self.post("/auth/login", {"username": username, "password": password})
        assert status == 200, body
        self.token = body["access_token"]
        self.user = body["user"]
        return self


@pytest.fixture()
def client(fresh_db: None) -> ApiClient:
    """Anonymous API client on a freshly seeded database."""
    return ApiClient()


@pytest.fixture()
def admin(fresh_db: None) -> ApiClient:
    """Client signed in as the seeded admin."""
    return ApiClient().login("admin", "Admin123!")


@pytest.fixture()
def manager(fresh_db: None) -> ApiClient:
    """Client signed in as Maria Lopez (manager of 'Customer Portal Redesign')."""
    return ApiClient().login("mlopez", "Manager123!")


@pytest.fixture()
def manager2(fresh_db: None) -> ApiClient:
    """Client signed in as David Chen (manager of 'Data Warehouse Migration')."""
    return ApiClient().login("dchen", "Manager123!")


@pytest.fixture()
def employee(fresh_db: None) -> ApiClient:
    """Client signed in as Aisha Patel (on Maria's team, assigned to the portal project)."""
    return ApiClient().login("apatel", "Employee123!")
