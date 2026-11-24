"""Audit log API: ADMIN and PM read the trail newest first, with filters and paging (spec 6, 7, 8, 13.1)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AuditLog, Department, Project, User
from app.db.seed import seed_portfolio
from app.security import create_access_token
from conftest import TEST_PASSWORD

# The seed's anchor date.
T = date(2026, 11, 25)

ROLE_EMAILS = {
    "ADMIN": "admin@acme.example",
    "PM": "pm@acme.example",
    "LEAD": "lead@acme.example",
    "VIEWER": "viewer@acme.example",
}

AUDIT_KEYS = {
    "id",
    "actor_id",
    "actor_email",
    "entity_type",
    "entity_id",
    "action",
    "before_state",
    "after_state",
    "created_at",
}


def day(offset: int) -> str:
    """ISO date ``offset`` days from ``T``."""
    return (T + timedelta(days=offset)).isoformat()


def headers_for(user: User) -> dict[str, str]:
    """Authorization header for an existing user."""
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def error_of(response: httpx.Response) -> tuple[int, str]:
    """Status code and error code of an error response."""
    return response.status_code, response.json()["error"]


@dataclass(frozen=True)
class Seeded:
    """Ids from the spec section 10 seed, plus a header per demo role."""

    user_ids: dict[str, int]
    department_ids: dict[str, int]
    project_ids: dict[str, int]
    headers: dict[str, dict[str, str]]


@pytest.fixture
def seeded(db_session: Session) -> Seeded:
    """Seed the spec section 10 portfolio at the fixed date ``T`` and commit it (the seed writes no audit rows)."""
    seed_portfolio(db_session, TEST_PASSWORD, today=T)
    db_session.commit()
    users = {user.email: user for user in db_session.scalars(select(User))}
    return Seeded(
        user_ids={email: user.id for email, user in users.items()},
        department_ids={d.name: d.id for d in db_session.scalars(select(Department))},
        project_ids={
            p.project_name.split(":")[0].removeprefix("Project "): p.id for p in db_session.scalars(select(Project))
        },
        headers={role: headers_for(users[email]) for role, email in ROLE_EMAILS.items()},
    )


@dataclass(frozen=True)
class Trail:
    """The ids of the records changed by ``trail``."""

    project_id: int
    allocation_id: int
    entry_id: int


@pytest.fixture
def trail(client: TestClient, seeded: Seeded) -> Trail:
    """Five audited changes through the API, by PM and ADMIN, in this order."""
    pm, admin = seeded.headers["PM"], seeded.headers["ADMIN"]
    project = client.post(
        "/projects",
        json={
            "project_name": "Audit Trail Project",
            "department_id": seeded.department_ids["Operations"],
            "start_date": day(0),
            "end_date": day(60),
            "planned_budget": "1000",
        },
        headers=pm,
    )
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]
    allocation = client.post(
        "/allocations",
        json={
            "user_id": seeded.user_ids["sana.khan@acme.example"],
            "project_id": project_id,
            "allocation_percentage": 10,
            "start_date": day(0),
            "end_date": day(10),
        },
        headers=admin,
    )
    assert allocation.status_code == 201, allocation.text
    assert client.put(f"/projects/{project_id}", json={"status": "ACTIVE"}, headers=pm).status_code == 200
    entry = client.post(
        "/budget-entries",
        json={"project_id": project_id, "category": "OTHER", "amount": "250", "entry_date": day(0)},
        headers=pm,
    )
    assert entry.status_code == 201, entry.text
    assert client.delete(f"/budget-entries/{entry.json()['id']}", headers=admin).status_code == 204
    return Trail(project_id=project_id, allocation_id=allocation.json()["id"], entry_id=entry.json()["id"])


def get_logs(client: TestClient, headers: dict[str, str], **params: Any) -> dict[str, Any]:
    """GET /audit-logs with the given filters; returns the JSON body."""
    response = client.get("/audit-logs", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def summary(body: dict[str, Any]) -> list[tuple[str, int, str]]:
    """(entity_type, entity_id, action) of each listed row, in order."""
    return [(item["entity_type"], item["entity_id"], item["action"]) for item in body["items"]]


# --- Reading the trail ------------------------------------------------------------------------------


def test_the_seed_writes_no_audit_rows(client: TestClient, seeded: Seeded) -> None:
    """A freshly seeded database has an empty audit log."""
    assert get_logs(client, seeded.headers["ADMIN"]) == {"items": [], "total": 0}


@pytest.mark.parametrize("role", ["ADMIN", "PM"])
def test_managers_read_the_trail_newest_first(client: TestClient, seeded: Seeded, trail: Trail, role: str) -> None:
    """ADMIN and PM see every change, newest first, with who made it."""
    body = get_logs(client, seeded.headers[role])
    assert body["total"] == 5
    assert summary(body) == [
        ("budget_entry", trail.entry_id, "DELETE"),
        ("budget_entry", trail.entry_id, "CREATE"),
        ("project", trail.project_id, "UPDATE"),
        ("allocation", trail.allocation_id, "CREATE"),
        ("project", trail.project_id, "CREATE"),
    ]
    assert all(set(item) == AUDIT_KEYS for item in body["items"])
    ids = [item["id"] for item in body["items"]]
    assert ids == sorted(ids, reverse=True)
    stamps = [datetime.fromisoformat(item["created_at"]) for item in body["items"]]
    assert stamps == sorted(stamps, reverse=True)
    assert [item["actor_email"] for item in body["items"]] == [
        "admin@acme.example",
        "pm@acme.example",
        "pm@acme.example",
        "admin@acme.example",
        "pm@acme.example",
    ]


def test_audit_states_show_the_change(client: TestClient, seeded: Seeded, trail: Trail) -> None:
    """CREATE has only an after state, UPDATE both, DELETE only a before state; money stays a string."""
    rows = {(item["entity_type"], item["action"]): item for item in get_logs(client, seeded.headers["PM"])["items"]}
    created = rows[("project", "CREATE")]
    assert created["before_state"] is None
    assert created["after_state"]["project_name"] == "Audit Trail Project"
    assert created["after_state"]["planned_budget"] == "1000.00" and created["after_state"]["status"] == "PLANNED"
    updated = rows[("project", "UPDATE")]
    assert (updated["before_state"]["status"], updated["after_state"]["status"]) == ("PLANNED", "ACTIVE")
    deleted = rows[("budget_entry", "DELETE")]
    assert deleted["after_state"] is None and deleted["before_state"]["amount"] == "250.00"
    assert rows[("allocation", "CREATE")]["after_state"]["allocation_percentage"] == 10


def test_user_changes_are_audited_without_secrets(client: TestClient, seeded: Seeded) -> None:
    """A user created by an ADMIN appears under entity_type=user, and no state holds a password hash."""
    created = client.post(
        "/users",
        json={"name": "New Lead", "email": "new.lead@acme.example", "password": TEST_PASSWORD, "role": "LEAD"},
        headers=seeded.headers["ADMIN"],
    )
    assert created.status_code == 201, created.text
    body = get_logs(client, seeded.headers["PM"], entity_type="user")
    assert summary(body) == [("user", created.json()["id"], "CREATE")]
    dumped = json.dumps(body)
    assert "password_hash" not in dumped and "$2b$" not in dumped


# --- Filters and paging -----------------------------------------------------------------------------


def test_filters_combine_and_page(client: TestClient, seeded: Seeded, trail: Trail) -> None:
    """entity_type, entity_id and actor_id filter and combine; total counts every match before paging."""
    headers = seeded.headers["ADMIN"]
    admin_id, pm_id = seeded.user_ids["admin@acme.example"], seeded.user_ids["pm@acme.example"]
    assert summary(get_logs(client, headers, entity_type="project")) == [
        ("project", trail.project_id, "UPDATE"),
        ("project", trail.project_id, "CREATE"),
    ]
    by_entry = get_logs(client, headers, entity_type="budget_entry", entity_id=trail.entry_id)
    assert summary(by_entry) == [
        ("budget_entry", trail.entry_id, "DELETE"),
        ("budget_entry", trail.entry_id, "CREATE"),
    ]
    by_admin = get_logs(client, headers, actor_id=admin_id)
    assert summary(by_admin) == [
        ("budget_entry", trail.entry_id, "DELETE"),
        ("allocation", trail.allocation_id, "CREATE"),
    ]
    assert {item["actor_id"] for item in by_admin["items"]} == {admin_id}
    assert get_logs(client, headers, actor_id=pm_id)["total"] == 3
    assert get_logs(client, headers, entity_type="allocation", actor_id=pm_id) == {"items": [], "total": 0}
    assert get_logs(client, headers, entity_type="deliverable") == {"items": [], "total": 0}
    page = get_logs(client, headers, limit=2, offset=1)
    assert page["total"] == 5
    assert summary(page) == [("budget_entry", trail.entry_id, "CREATE"), ("project", trail.project_id, "UPDATE")]
    assert get_logs(client, headers, offset=5) == {"items": [], "total": 5}


def test_newest_first_uses_created_at_then_id(client: TestClient, seeded: Seeded, db_session: Session) -> None:
    """Rows written in one transaction share created_at and come highest id first; an older timestamp sorts last."""
    older = datetime(2026, 1, 1, tzinfo=timezone.utc)
    db_session.add_all(
        [
            AuditLog(entity_type="project", entity_id=1, action="UPDATE", after_state={"n": 1}),
            AuditLog(entity_type="project", entity_id=1, action="UPDATE", after_state={"n": 2}),
            AuditLog(entity_type="project", entity_id=1, action="UPDATE", after_state={"n": 3}, created_at=older),
        ]
    )
    db_session.commit()
    body = get_logs(client, seeded.headers["PM"], entity_type="project", entity_id=1)
    assert [item["after_state"]["n"] for item in body["items"]] == [2, 1, 3]
    assert body["items"][0]["created_at"] == body["items"][1]["created_at"]
    assert body["items"][0]["actor_id"] is None and body["items"][0]["actor_email"] is None


@pytest.mark.parametrize(
    "params",
    [
        {"entity_type": "Project"},
        {"entity_type": "budget-entry"},
        {"entity_type": ""},
        {"entity_type": "x" * 41},
        {"entity_id": 0},
        {"entity_id": "one"},
        {"actor_id": -1},
        {"limit": 201},
        {"offset": -1},
    ],
)
def test_bad_filters_are_400(client: TestClient, seeded: Seeded, params: dict[str, Any]) -> None:
    """Malformed filters and paging are 400 VALIDATION_ERROR naming the parameter."""
    response = client.get("/audit-logs", params=params, headers=seeded.headers["ADMIN"])
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert [detail["field"] for detail in response.json()["details"]] == list(params)


# --- RBAC (spec section 7: audit logs are read by ADMIN and PM only) ---------------------------------


@pytest.mark.parametrize("role", ["LEAD", "VIEWER"])
def test_lead_and_viewer_cannot_read_the_audit_log(
    client: TestClient, seeded: Seeded, trail: Trail, role: str
) -> None:
    """LEAD and VIEWER get 403 ACCESS_DENIED, with or without filters."""
    headers = seeded.headers[role]
    assert error_of(client.get("/audit-logs", headers=headers)) == (403, "ACCESS_DENIED")
    filtered = client.get("/audit-logs", params={"entity_type": "project"}, headers=headers)
    assert error_of(filtered) == (403, "ACCESS_DENIED")


def test_the_audit_log_requires_a_token(client: TestClient, seeded: Seeded) -> None:
    """Without a bearer token the audit log is 401 UNAUTHENTICATED."""
    response = client.get("/audit-logs")
    assert error_of(response) == (401, "UNAUTHENTICATED")
    assert response.headers["www-authenticate"] == "Bearer"


def test_the_audit_log_is_read_only(client: TestClient, seeded: Seeded) -> None:
    """There is no route to write, change or delete audit rows."""
    headers = seeded.headers["ADMIN"]
    assert client.post("/audit-logs", json={}, headers=headers).status_code == 405
    assert client.delete("/audit-logs", headers=headers).status_code == 405
    assert error_of(client.get("/audit-logs/1", headers=headers)) == (404, "NOT_FOUND")
