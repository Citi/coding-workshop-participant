"""Transactions and audit: one row per mutation, none on failure, append-only (spec 6, 13.1)."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import date
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.db.models import AuditLog, Department, Project, User
from app.security import create_access_token
from app.services import departments as departments_service
from app.services import users as users_service
from conftest import TEST_PASSWORD


def headers_for(user: User) -> dict[str, str]:
    """Authorization header for an existing user."""
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def audit_rows(db: Session) -> list[AuditLog]:
    """Every audit row, oldest first, read fresh from the database."""
    db.expire_all()
    return list(db.scalars(select(AuditLog).order_by(AuditLog.id)))


def count(db: Session, model: type[Any]) -> int:
    """Number of rows in a model's table."""
    return db.scalar(select(func.count()).select_from(model)) or 0


def assert_no_secrets(row: AuditLog) -> None:
    """Audit states never hold a password hash."""
    dumped = json.dumps([row.before_state, row.after_state])
    assert "password_hash" not in dumped and "$2b$" not in dumped


def new_account(**fields: Any) -> dict[str, Any]:
    """A user body with the test password plus the given fields."""
    return {"password": TEST_PASSWORD, **fields}


def test_each_mutation_writes_exactly_one_audit_row(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    """Create, update and delete of departments and users, and registration, each add one row."""
    admin = make_user("ADMIN", email="admin@test.example")
    headers = headers_for(admin)
    assert audit_rows(db_session) == []
    written = 0

    def expect(response: httpx.Response, status: int, entity_type: str, action: str) -> AuditLog:
        """Check the response, then that exactly one new audit row of this kind exists."""
        nonlocal written
        assert response.status_code == status, response.text
        rows = audit_rows(db_session)
        assert len(rows) == written + 1, [(r.entity_type, r.action) for r in rows]
        written += 1
        row = rows[-1]
        assert (row.entity_type, row.action) == (entity_type, action)
        assert row.created_at is not None
        assert_no_secrets(row)
        return row

    created = client.post("/departments", json={"name": "Engineering"}, headers=headers)
    row = expect(created, 201, "department", "CREATE")
    department_id = created.json()["id"]
    assert (row.entity_id, row.actor_id) == (department_id, admin.id)
    assert row.actor_email == "admin@test.example"
    assert row.before_state is None
    assert row.after_state["name"] == "Engineering"
    assert set(row.after_state) == {"id", "name", "created_at"}

    row = expect(
        client.put(f"/departments/{department_id}", json={"name": "Platform"}, headers=headers),
        200,
        "department",
        "UPDATE",
    )
    assert (row.before_state["name"], row.after_state["name"]) == ("Engineering", "Platform")

    registered = client.post(
        "/auth/register",
        json={
            "name": "Self Starter",
            "email": "self@test.example",
            "password": TEST_PASSWORD,
            "department_id": department_id,
        },
    )
    row = expect(registered, 201, "user", "CREATE")
    assert (row.actor_id, row.actor_email) == (registered.json()["id"], "self@test.example")
    assert row.after_state["role"] == "VIEWER"
    assert row.after_state["department_id"] == department_id

    made = client.post(
        "/users",
        json=new_account(name="Lead Person", email="lead@test.example", role="LEAD"),
        headers=headers,
    )
    row = expect(made, 201, "user", "CREATE")
    user_id = made.json()["id"]
    assert (row.entity_id, row.actor_id) == (user_id, admin.id)

    row = expect(
        client.put(
            f"/users/{user_id}",
            json={
                "role": "PM",
                "password": "a different password",
                "department_id": department_id,
            },
            headers=headers,
        ),
        200,
        "user",
        "UPDATE",
    )
    assert (row.before_state["role"], row.after_state["role"]) == ("LEAD", "PM")
    assert row.before_state["department_id"] is None
    assert row.after_state["department_id"] == department_id
    assert row.after_state["password_changed"] is True
    assert "password_changed" not in row.before_state

    row = expect(client.delete(f"/users/{user_id}", headers=headers), 204, "user", "DELETE")
    assert row.entity_id == user_id and row.before_state["email"] == "lead@test.example"
    assert row.after_state is None

    deleted = client.delete(f"/departments/{department_id}", headers=headers)
    row = expect(deleted, 204, "department", "DELETE")
    assert row.before_state["name"] == "Platform" and row.after_state is None

    # Reads write nothing.
    client.get("/users", headers=headers)
    client.get("/departments", headers=headers)
    client.get("/auth/me", headers=headers)
    client.post("/auth/login", json={"email": "admin@test.example", "password": TEST_PASSWORD})
    assert len(audit_rows(db_session)) == written == 7


@pytest.fixture
def world(make_user: Callable[..., User], db_session: Session) -> dict[str, Any]:
    """An admin, a viewer, a department with a project, and a user whose email is taken."""
    department = Department(name="Engineering")
    db_session.add(department)
    db_session.commit()
    db_session.add(
        Project(
            project_name="Alpha",
            department_id=department.id,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
        )
    )
    db_session.commit()
    admin = make_user("ADMIN", email="admin@test.example")
    viewer = make_user("VIEWER", email="viewer@test.example")
    return {"admin": admin, "viewer": viewer, "department_id": department.id}


MakeBody = Callable[[dict[str, Any]], dict[str, Any] | None]

FAILED_MUTATIONS: list[tuple[str, str, str, MakeBody, str, int]] = [
    ("POST", "/departments", "admin", lambda w: {"name": "ENGINEERING"}, "duplicate name", 409),
    ("DELETE", "/departments/{department_id}", "admin", lambda w: None, "department in use", 409),
    ("PUT", "/departments/999999", "admin", lambda w: {"name": "X"}, "missing department", 404),
    ("POST", "/departments", "viewer", lambda w: {"name": "Ops"}, "viewer create", 403),
    (
        "POST",
        "/users",
        "admin",
        lambda w: new_account(name="Dup", email="Viewer@Test.Example", role="PM"),
        "duplicate email",
        409,
    ),
    (
        "POST",
        "/users",
        "admin",
        lambda w: new_account(name="N", email="n@test.example", role="PM", department_id=9),
        "unknown department",
        400,
    ),
    ("PUT", "/users/{admin_id}", "admin", lambda w: {"role": "VIEWER"}, "own role", 409),
    ("DELETE", "/users/{admin_id}", "admin", lambda w: None, "delete self", 409),
    ("DELETE", "/users/{admin_id}", "viewer", lambda w: None, "viewer delete", 403),
    (
        "PUT",
        "/users/{viewer_id}",
        "admin",
        lambda w: {"email": "admin@test.example"},
        "email taken",
        409,
    ),
    (
        "POST",
        "/auth/register",
        "",
        lambda w: new_account(name="R", email="r@test.example", role="ADMIN"),
        "register with role",
        400,
    ),
    (
        "POST",
        "/auth/register",
        "",
        lambda w: {"name": "R", "email": "VIEWER@test.example", "password": TEST_PASSWORD},
        "register duplicate",
        409,
    ),
]


@pytest.mark.parametrize(
    ("method", "path", "who", "make_body", "case", "status"),
    FAILED_MUTATIONS,
    ids=[case[4] for case in FAILED_MUTATIONS],
)
def test_failed_mutations_write_no_audit_row(
    client: TestClient,
    db_session: Session,
    world: dict[str, Any],
    method: str,
    path: str,
    who: str,
    make_body: Callable[[dict[str, Any]], dict[str, Any] | None],
    case: str,
    status: int,
) -> None:
    """Rejected changes leave no audit row and no data change behind."""
    url = path.format(
        department_id=world["department_id"],
        admin_id=world["admin"].id,
        viewer_id=world["viewer"].id,
    )
    kwargs: dict[str, Any] = {"headers": headers_for(world[who]) if who else {}}
    body = make_body(world)
    if body is not None:
        kwargs["json"] = body
    before = (count(db_session, User), count(db_session, Department))
    response = client.request(method, url, **kwargs)
    assert response.status_code == status, f"{case}: {response.text}"
    assert audit_rows(db_session) == []
    assert (count(db_session, User), count(db_session, Department)) == before
    assert db_session.get(User, world["admin"].id).role == "ADMIN"
    assert db_session.get(User, world["viewer"].id).email == "viewer@test.example"


@pytest.mark.parametrize(
    ("service", "method", "path", "body"),
    [
        (departments_service, "POST", "/departments", {"name": "Finance"}),
        (departments_service, "PUT", "/departments/{department_id}", {"name": "Renamed"}),
        (departments_service, "DELETE", "/departments/{empty_department_id}", None),
        (
            users_service,
            "POST",
            "/users",
            {"name": "N", "email": "n@test.example", "password": TEST_PASSWORD, "role": "PM"},
        ),
        (users_service, "PUT", "/users/{viewer_id}", {"name": "Changed", "role": "LEAD"}),
        (users_service, "DELETE", "/users/{viewer_id}", None),
        (
            users_service,
            "POST",
            "/auth/register",
            {"name": "R", "email": "r@test.example", "password": TEST_PASSWORD},
        ),
    ],
)
def test_a_failure_after_the_audit_row_rolls_back_everything(
    client: TestClient,
    db_session: Session,
    world: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    service: Any,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    """The change and its audit row commit together or not at all."""
    empty = Department(name="Empty")
    db_session.add(empty)
    db_session.commit()
    real_record_audit = service.record_audit

    def record_then_fail(*args: Any, **kwargs: Any) -> AuditLog:
        """Write the audit row, then fail before the transaction commits."""
        real_record_audit(*args, **kwargs)  # the row is added and flushed ...
        raise RuntimeError("simulated failure after the audit row")  # ... then it fails

    monkeypatch.setattr(service, "record_audit", record_then_fail)
    snapshot_before = _snapshot(db_session)
    url = path.format(
        department_id=world["department_id"],
        empty_department_id=empty.id,
        viewer_id=world["viewer"].id,
    )
    kwargs: dict[str, Any] = {"headers": headers_for(world["admin"])}
    if body is not None:
        kwargs["json"] = body
    response = client.request(method, url, **kwargs)
    assert response.status_code == 500
    assert response.json()["error"] == "INTERNAL_ERROR"
    assert audit_rows(db_session) == []
    assert _snapshot(db_session) == snapshot_before


def _snapshot(db: Session) -> tuple[list[tuple[Any, ...]], list[tuple[Any, ...]]]:
    """Every user and department row, for before/after comparisons."""
    db.expire_all()
    users = db.execute(
        text("SELECT id, name, email, role, department_id, password_hash FROM users ORDER BY id")
    ).all()
    departments = db.execute(text("SELECT id, name FROM departments ORDER BY id")).all()
    return [tuple(row) for row in users], [tuple(row) for row in departments]


def test_audit_logs_are_append_only_in_the_database(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    """UPDATE and DELETE on audit_logs raise from the trigger, by SQL or through the ORM."""
    headers = headers_for(make_user("ADMIN"))
    created = client.post("/departments", json={"name": "Finance"}, headers=headers)
    assert created.status_code == 201
    original = [(row.id, row.action, row.after_state) for row in audit_rows(db_session)]
    assert len(original) == 1

    for statement in ("UPDATE audit_logs SET action = 'DELETE'", "DELETE FROM audit_logs"):
        with pytest.raises(DBAPIError, match="audit_logs is append-only"):
            db_session.execute(text(statement))
        db_session.rollback()

    row = audit_rows(db_session)[0]
    row.after_state = {"name": "Tampered"}
    with pytest.raises(DBAPIError, match="audit_logs is append-only"):
        db_session.commit()
    db_session.rollback()

    db_session.delete(audit_rows(db_session)[0])
    with pytest.raises(DBAPIError, match="audit_logs is append-only"):
        db_session.commit()
    db_session.rollback()

    assert [(row.id, row.action, row.after_state) for row in audit_rows(db_session)] == original
