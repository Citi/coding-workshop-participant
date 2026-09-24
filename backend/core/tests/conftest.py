"""Shared fixtures. Tests run against a separate database, so dev data is never touched.

The schema is rebuilt once per run. Before every test, users/tickets/notes are emptied
and the buildings, floors and seats go back to just the seeded ones (admins can change
them through the API).
"""

import os

# Settings are read at import time, so point them at the test database first.
os.environ["IS_LOCAL"] = "true"
os.environ["POSTGRES_NAME"] = os.environ.get("TEST_POSTGRES_NAME", "codingworkshop_test")
os.environ["JWT_SECRET"] = "test-only-signing-secret-0123456789abcdef"

from collections.abc import Callable  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import db  # noqa: E402
import security  # noqa: E402
import tokens  # noqa: E402
from config import settings  # noqa: E402
from function import API_PREFIX, app  # noqa: E402

SQL_DIR = Path(__file__).resolve().parent.parent / "sql"

Headers = dict[str, str]


@pytest.fixture(scope="session", autouse=True)
def _test_database() -> None:
    """Rebuild the test schema once. Refuses to run against a non-test database."""
    if not settings.postgres_name.endswith("_test"):
        pytest.exit(f"Refusing to run tests against '{settings.postgres_name}'", returncode=2)
    if not db.ping():
        pytest.exit(
            f"Can't reach Postgres database '{settings.postgres_name}'. "
            "See 'Running the tests' in README.md.",
            returncode=2,
        )
    with db.transaction() as conn:
        for name in ("reset.sql", "schema.sql", "seed.sql"):
            conn.execute((SQL_DIR / name).read_text())


@pytest.fixture(autouse=True)
def _empty_tables() -> None:
    """Start every test with no users, tickets or notes, and only the seeded locations."""
    with db.transaction() as conn:
        conn.execute(
            "TRUNCATE ticket_status_history, ticket_notes, tickets, users, seats, floors, buildings "
            "RESTART IDENTITY CASCADE"
        )
        conn.execute((SQL_DIR / "seed.sql").read_text())


@pytest.fixture(autouse=True)
def _fast_hashing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Real hashing takes ~0.1s per call; tests don't need that strength."""
    monkeypatch.setattr(security, "ITERATIONS", 1_000)


@pytest.fixture
def client() -> TestClient:
    """HTTP client for the app."""
    return TestClient(app)


@pytest.fixture
def api() -> str:
    """URL prefix every route is served under."""
    return API_PREFIX


@pytest.fixture
def run_sql() -> Callable[..., list[dict[str, Any]]]:
    """Run SQL directly, for setup the API can't do yet (close, assign) and for checks."""

    def _run(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with db.transaction() as conn:
            cur = conn.execute(query, params)
            return cur.fetchall() if cur.description else []

    return _run


@pytest.fixture
def register(client: TestClient, api: str) -> Callable[..., dict[str, Any]]:
    """Register a user through the API and return it."""

    def _register(
        email: str = "jane@acme.inc", full_name: str = "Jane Doe", password: str = "password123"
    ) -> dict[str, Any]:
        response = client.post(
            f"{api}/auth/register",
            json={"email": email, "full_name": full_name, "password": password},
        )
        assert response.status_code == 201, response.text
        return response.json()

    return _register


def bearer(user: dict[str, Any]) -> Headers:
    """Authorization headers with a real signed token for this user and role."""
    token, _ = tokens.create_access_token(user["user_id"], user["role"])
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def set_role(run_sql: Callable[..., list[dict[str, Any]]]) -> Callable[[int, str], None]:
    """Give a user a role by name, directly in SQL, since the API can't promote anyone yet."""

    def _set(user_id: int, role: str) -> None:
        run_sql(
            "UPDATE users SET role_id = (SELECT role_id FROM roles WHERE role_name = %s) "
            "WHERE user_id = %s",
            (role, user_id),
        )

    return _set


@pytest.fixture
def user_with_role(
    register: Callable[..., dict[str, Any]], set_role: Callable[[int, str], None]
) -> Callable[[str], dict[str, Any]]:
    """Register a user and set their role directly, since the API can't promote anyone yet."""

    def _make(role: str) -> dict[str, Any]:
        user = register(f"{role}@acme.inc", f"Test {role.title()}")
        set_role(user["user_id"], role)
        return {**user, "role": role}

    return _make


@pytest.fixture
def jane_user(register: Callable[..., dict[str, Any]]) -> dict[str, Any]:
    """A registered employee."""
    return register()


@pytest.fixture
def jane(jane_user: dict[str, Any]) -> Headers:
    """Headers for jane_user."""
    return bearer(jane_user)


@pytest.fixture
def eve_user(register: Callable[..., dict[str, Any]]) -> dict[str, Any]:
    """A second employee, to check one can't see the other's tickets."""
    return register("eve@acme.inc", "Eve Other")


@pytest.fixture
def eve(eve_user: dict[str, Any]) -> Headers:
    """Headers for eve_user."""
    return bearer(eve_user)


@pytest.fixture
def loc(run_sql: Callable[..., list[dict[str, Any]]]) -> dict[str, int]:
    """Seeded location ids by name, e.g. loc['A3'] is Building A floor 3, loc['A301'] its seat 301."""
    ids: dict[str, int] = {}
    for row in run_sql("SELECT building_id, building_name FROM buildings"):
        ids[row["building_name"][-1]] = row["building_id"]
    for row in run_sql(
        "SELECT f.floor_id, f.floor_number, b.building_name FROM floors f "
        "JOIN buildings b USING (building_id)"
    ):
        ids[f"{row['building_name'][-1]}{row['floor_number']}"] = row["floor_id"]
    for row in run_sql(
        "SELECT s.seat_id, s.seat_number, b.building_name FROM seats s "
        "JOIN floors f USING (floor_id) JOIN buildings b USING (building_id)"
    ):
        ids[f"{row['building_name'][-1]}{row['seat_number']}"] = row["seat_id"]
    return ids


@pytest.fixture
def ticket_payload(loc: dict[str, int]) -> Callable[..., dict[str, Any]]:
    """A valid create-ticket body (scope 'me' at A / floor 3 / seat 301), with overrides."""

    def _payload(**overrides: Any) -> dict[str, Any]:
        body = {
            "title": "Wi-Fi keeps dropping",
            "description": "My laptop loses Wi-Fi every 5-10 minutes.",
            "category": "network",
            "affected_scope": "me",
            "building_id": loc["A"],
            "floor_id": loc["A3"],
            "seat_id": loc["A301"],
        }
        body.update(overrides)
        return {k: v for k, v in body.items() if v is not None}

    return _payload


@pytest.fixture
def create_ticket(
    client: TestClient, api: str, ticket_payload: Callable[..., dict[str, Any]]
) -> Callable[..., dict[str, Any]]:
    """Create a ticket through the API and return it."""

    def _create(headers: Headers, **overrides: Any) -> dict[str, Any]:
        response = client.post(f"{api}/tickets", json=ticket_payload(**overrides), headers=headers)
        assert response.status_code == 201, response.text
        return response.json()

    return _create


@pytest.fixture
def admin(user_with_role: Callable[[str], dict[str, Any]]) -> Headers:
    """Headers for a Facility Admin."""
    return bearer(user_with_role("admin"))


@pytest.fixture
def engineers(
    register: Callable[..., dict[str, Any]], set_role: Callable[[int, str], None]
) -> dict[str, int]:
    """Two engineers' user ids by first name: 'sam' (Sam Tech) and 'kim' (Kim Fixit)."""
    ids = {}
    for email, name in (("sam@acme.inc", "Sam Tech"), ("kim@acme.inc", "Kim Fixit")):
        user = register(email, name)
        set_role(user["user_id"], "engineer")
        ids[name.split()[0].lower()] = user["user_id"]
    return ids


@pytest.fixture
def sam(engineers: dict[str, int]) -> Headers:
    """Headers for the engineer Sam Tech."""
    return bearer({"user_id": engineers["sam"], "role": "engineer"})


@pytest.fixture
def kim(engineers: dict[str, int]) -> Headers:
    """Headers for the engineer Kim Fixit."""
    return bearer({"user_id": engineers["kim"], "role": "engineer"})
