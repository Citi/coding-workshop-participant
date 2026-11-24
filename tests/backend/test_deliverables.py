"""Deliverables API: CRUD, filters, status rules, validation, RBAC, impact and audit (spec 6, 7, 8, 13.1)."""

from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Row, create_engine, delete, func, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.api.deps import today_utc
from app.config import get_settings
from app.db.models import AuditLog, Deliverable, DeliverableDependency, Project, ResourceAllocation, User
from app.db.seed import seed_portfolio
from app.db.session import build_connect_args, build_url
from app.errors import AppError
from app.schemas.deliverables import DeliverableCreate
from app.security import create_access_token
from app.services import deliverables as deliverables_service

SEED_PASSWORD = secrets.token_urlsafe(12)
ROLE_EMAILS = {
    "ADMIN": "admin@acme.example",
    "PM": "pm@acme.example",
    "LEAD": "lead@acme.example",
    "VIEWER": "viewer@acme.example",
}
DELIVERABLE_KEYS = {
    "id",
    "project_id",
    "project_name",
    "title",
    "description",
    "assigned_user_id",
    "assigned_user_name",
    "start_date",
    "due_date",
    "completion_percentage",
    "status",
    "blocked_reason",
    "is_overdue",
    "created_at",
    "updated_at",
}
ALPHA_TITLES = {
    "Requirements Sign-off",
    "API Schema",
    "Payments Service Integration",
    "Mobile Client Integration",
    "End-to-End Testing",
    "Data Migration Plan",
}
# Not DONE and due before T in spec section 10.
OVERDUE_TITLES = {
    "API Schema",
    "Data Migration Plan",
    "Campaign Creative",
    "Scanner Procurement",
    "Warehouse Staff Training",
}
MISSING_ID = 999_999


@dataclass(frozen=True)
class World:
    """The seeded spec section 10 data: ids by title, project and person, plus demo-user headers."""

    today: date
    deliverables: dict[str, int]
    projects: dict[str, int]
    user_ids: dict[str, int]
    role_headers: dict[str, dict[str, str]]

    def headers(self, role: str) -> dict[str, str]:
        """Authorization header for the demo user with ``role``."""
        return self.role_headers[role]


def seed_world(db: Session, anchor: date) -> World:
    """Seed spec section 10 anchored on ``anchor`` and index the rows the tests need."""
    seed_portfolio(db, SEED_PASSWORD, today=anchor)
    db.commit()
    users = list(db.scalars(select(User)))
    return World(
        today=anchor,
        deliverables={title: row_id for row_id, title in db.execute(select(Deliverable.id, Deliverable.title))},
        projects={
            name.split(":")[0].removeprefix("Project "): row_id
            for row_id, name in db.execute(select(Project.id, Project.project_name))
        },
        user_ids={user.name: user.id for user in users},
        role_headers={
            role: {"Authorization": f"Bearer {create_access_token(next(u for u in users if u.email == email))}"}
            for role, email in ROLE_EMAILS.items()
        },
    )


@pytest.fixture
def world(db_session: Session) -> World:
    """Spec section 10 seeded on today's UTC date, which is what ``is_overdue`` compares against."""
    return seed_world(db_session, today_utc())


def error_of(response: httpx.Response) -> tuple[int, str]:
    """Status code and error code of an error response."""
    return response.status_code, response.json()["error"]


def fields_of(response: httpx.Response) -> set[str]:
    """Field names in an error response's details."""
    return {detail["field"] for detail in response.json()["details"]}


def titles(items: list[dict[str, Any]]) -> set[str]:
    """Titles of a list of deliverables."""
    return {item["title"] for item in items}


def audit_rows(db: Session, entity_type: str = "deliverable") -> list[Row[Any]]:
    """Audit rows for one entity type, oldest first (read fresh from the database)."""
    return list(
        db.execute(
            select(
                AuditLog.action, AuditLog.entity_id, AuditLog.actor_id, AuditLog.before_state, AuditLog.after_state
            )
            .where(AuditLog.entity_type == entity_type)
            .order_by(AuditLog.id)
        )
    )


def deliverable_count(db: Session) -> int:
    """Number of deliverables in the database."""
    return db.scalar(select(func.count()).select_from(Deliverable)) or 0


def new_body(world: World, **overrides: Any) -> dict[str, Any]:
    """A valid create body for a new Alpha deliverable, with ``overrides`` applied."""
    body: dict[str, Any] = {
        "project_id": world.projects["Alpha"],
        "title": "Fraud Rules Review",
        "due_date": (world.today + timedelta(days=30)).isoformat(),
    }
    body.update(overrides)
    return body


def parse_time(value: str) -> datetime:
    """Parse an ISO timestamp from a response."""
    return datetime.fromisoformat(value)


# --- Create, read, update, delete -------------------------------------------------------------------


def test_create_read_update_delete_round_trip(client: TestClient, world: World, db_session: Session) -> None:
    """POST 201 with names and is_overdue; GET returns it; PUT changes it; DELETE 204; then GET 404."""
    pm = world.headers("PM")
    body = new_body(
        world,
        title="  Fraud Rules Review  ",
        description="Review the card-fraud rules with the risk team.\nTwo sessions.",
        assigned_user_id=world.user_ids["Priya Nair"],
        start_date=(world.today - timedelta(days=2)).isoformat(),
        completion_percentage=10,
        status="IN_PROGRESS",
    )
    created = client.post("/deliverables", json=body, headers=pm)
    assert created.status_code == 201, created.text
    item = created.json()
    assert set(item) == DELIVERABLE_KEYS
    assert item["title"] == "Fraud Rules Review"
    assert item["project_name"] == "Project Alpha: Customer Payments Platform"
    assert item["assigned_user_name"] == "Priya Nair"
    assert (item["completion_percentage"], item["status"], item["is_overdue"]) == (10, "IN_PROGRESS", False)
    assert item["description"] == "Review the card-fraud rules with the risk team.\nTwo sessions."

    fetched = client.get(f"/deliverables/{item['id']}", headers=world.headers("VIEWER"))
    assert fetched.status_code == 200 and fetched.json() == item

    updated = client.put(
        f"/deliverables/{item['id']}",
        json={"title": "Fraud Rules Sign-off", "completion_percentage": 55, "assigned_user_id": None},
        headers=pm,
    )
    assert updated.status_code == 200, updated.text
    changed = updated.json()
    assert (changed["title"], changed["completion_percentage"]) == ("Fraud Rules Sign-off", 55)
    assert changed["assigned_user_id"] is None and changed["assigned_user_name"] is None
    assert changed["description"] == item["description"] and changed["status"] == "IN_PROGRESS"
    assert parse_time(changed["updated_at"]) > parse_time(item["updated_at"])
    assert changed["created_at"] == item["created_at"]

    described = client.put(f"/deliverables/{item['id']}", json={"description": "  One session.  "}, headers=pm)
    assert described.json()["description"] == "One session."
    cleared = client.put(f"/deliverables/{item['id']}", json={"description": None}, headers=pm)
    assert cleared.status_code == 200 and cleared.json()["description"] is None
    assert cleared.json()["title"] == "Fraud Rules Sign-off"

    deleted = client.delete(f"/deliverables/{item['id']}", headers=pm)
    assert deleted.status_code == 204 and deleted.content == b""
    assert error_of(client.get(f"/deliverables/{item['id']}", headers=pm)) == (404, "NOT_FOUND")
    assert db_session.scalar(select(Deliverable.id).where(Deliverable.id == item["id"])) is None


def test_create_applies_defaults(client: TestClient, world: World) -> None:
    """Only project, title and due date are required; the rest default sensibly; blank text becomes null."""
    response = client.post("/deliverables", json=new_body(world, description="   "), headers=world.headers("PM"))
    assert response.status_code == 201, response.text
    item = response.json()
    assert item["status"] == "NOT_STARTED" and item["completion_percentage"] == 0
    assert item["assigned_user_id"] is None and item["start_date"] is None
    assert item["description"] is None and item["blocked_reason"] is None
    assert item["created_at"] == item["updated_at"]


def test_is_overdue_compares_the_due_date_with_today(client: TestClient, world: World) -> None:
    """Due yesterday and open is overdue; due today is not; DONE is never overdue."""
    pm = world.headers("PM")
    yesterday = (world.today - timedelta(days=1)).isoformat()
    cases = [
        ({"due_date": yesterday}, True),
        ({"due_date": world.today.isoformat()}, False),
        ({"due_date": yesterday, "status": "DONE"}, False),
        ({"due_date": yesterday, "status": "BLOCKED", "blocked_reason": "Waiting"}, True),
    ]
    for overrides, expected in cases:
        response = client.post("/deliverables", json=new_body(world, **overrides), headers=pm)
        assert response.status_code == 201, response.text
        assert response.json()["is_overdue"] is expected, overrides


# --- Listing and filters ----------------------------------------------------------------------------


def test_list_returns_every_deliverable_ordered_by_id(client: TestClient, world: World) -> None:
    """The envelope is {items, total}; items are ordered by id and carry is_overdue."""
    response = client.get("/deliverables", params={"limit": 200}, headers=world.headers("VIEWER"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items", "total"}
    assert body["total"] == 21 and len(body["items"]) == 21
    assert [item["id"] for item in body["items"]] == sorted(world.deliverables.values())
    assert all(set(item) == DELIVERABLE_KEYS for item in body["items"])
    assert {item["title"] for item in body["items"] if item["is_overdue"]} == OVERDUE_TITLES
    api_schema = next(item for item in body["items"] if item["title"] == "API Schema")
    assert api_schema["blocked_reason"] == "Awaiting security approval of the partner data contract"
    assert api_schema["assigned_user_name"] == "Priya Nair"


def test_list_paginates_with_limit_and_offset(client: TestClient, world: World) -> None:
    """limit and offset slice the ordered list; total counts every match."""
    response = client.get("/deliverables", params={"limit": 5, "offset": 5}, headers=world.headers("LEAD"))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 21
    assert [item["id"] for item in body["items"]] == sorted(world.deliverables.values())[5:10]


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"q": "integration"}, {"Payments Service Integration", "Mobile Client Integration", "Bank Feed Integration"}),
        ({"q": "api SCHEMA"}, {"API Schema"}),
        ({"q": "%"}, set()),
        ({"q": "_"}, set()),
        ({"status": "BLOCKED"}, {"API Schema", "Scanner Procurement"}),
        ({"overdue": "true"}, OVERDUE_TITLES),
        ({"overdue": "true", "status": "BLOCKED"}, {"API Schema", "Scanner Procurement"}),
    ],
)
def test_list_filters(client: TestClient, world: World, params: dict[str, str], expected: set[str]) -> None:
    """q (title contains, ignoring case, no wildcards), status and overdue filter the list."""
    response = client.get("/deliverables", params=params, headers=world.headers("VIEWER"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert titles(body["items"]) == expected
    assert body["total"] == len(expected)


def test_list_filters_by_project_assignee_and_combinations(client: TestClient, world: World) -> None:
    """project_id and assigned_user_id filter; filters combine with AND; overdue=false does not filter."""
    viewer = world.headers("VIEWER")

    def listed(**params: Any) -> set[str]:
        response = client.get("/deliverables", params=params, headers=viewer)
        assert response.status_code == 200, response.text
        return titles(response.json()["items"])

    assert listed(project_id=world.projects["Alpha"]) == ALPHA_TITLES
    assert listed(assigned_user_id=world.user_ids["Rohan Das"]) == {
        "Mobile Client Integration",
        "End-to-End Testing",
        "Data Migration Plan",
    }
    assert listed(project_id=world.projects["Alpha"], overdue="true") == {"API Schema", "Data Migration Plan"}
    assert listed(assigned_user_id=world.user_ids["Sana Khan"], status="IN_PROGRESS") == {
        "Warehouse Staff Training",
        "Pilot Go-Live",
    }
    assert listed(project_id=world.projects["Epsilon"], overdue="true") == set()
    assert len(listed(overdue="false", limit=200)) == 21
    assert listed(project_id=MISSING_ID) == set()


@pytest.mark.parametrize(
    "params",
    [
        {"status": "FINISHED"},
        {"overdue": "sometimes"},
        {"project_id": "abc"},
        {"project_id": 0},
        {"assigned_user_id": -1},
        {"limit": 0},
        {"limit": 201},
        {"offset": -1},
        {"q": "x" * 201},
    ],
)
def test_list_rejects_bad_query_parameters(client: TestClient, world: World, params: dict[str, Any]) -> None:
    """Invalid filters give 400 VALIDATION_ERROR, not FastAPI's 422."""
    response = client.get("/deliverables", params=params, headers=world.headers("VIEWER"))
    assert error_of(response) == (400, "VALIDATION_ERROR")


# --- Service rules ------------------------------------------------------------------------------------


def test_done_forces_completion_to_100(client: TestClient, world: World, db_session: Session) -> None:
    """DONE on create or update sets completion 100, and a DONE item cannot drop below 100."""
    lead = world.headers("LEAD")
    created = client.post("/deliverables", json=new_body(world, status="DONE", completion_percentage=30), headers=lead)
    assert created.status_code == 201, created.text
    assert created.json()["completion_percentage"] == 100

    payments = world.deliverables["Payments Service Integration"]
    done = client.put(f"/deliverables/{payments}", json={"status": "DONE"}, headers=lead)
    assert done.status_code == 200, done.text
    assert (done.json()["status"], done.json()["completion_percentage"]) == ("DONE", 100)

    lowered = client.put(f"/deliverables/{payments}", json={"completion_percentage": 40}, headers=lead)
    assert lowered.status_code == 200, lowered.text
    assert lowered.json()["completion_percentage"] == 100

    reopened = client.put(
        f"/deliverables/{payments}", json={"status": "IN_PROGRESS", "completion_percentage": 90}, headers=lead
    )
    assert (reopened.json()["status"], reopened.json()["completion_percentage"]) == ("IN_PROGRESS", 90)
    stored = db_session.execute(
        select(Deliverable.status, Deliverable.completion_percentage).where(Deliverable.id == payments)
    ).one()
    assert tuple(stored) == ("IN_PROGRESS", 90)


def test_leaving_blocked_clears_the_blocked_reason(client: TestClient, world: World, db_session: Session) -> None:
    """A BLOCKED item keeps its reason until its status changes; other statuses never keep one."""
    pm = world.headers("PM")
    api_schema = world.deliverables["API Schema"]
    reason = "Awaiting security approval of the partner data contract"

    still_blocked = client.put(f"/deliverables/{api_schema}", json={"completion_percentage": 45}, headers=pm)
    assert (still_blocked.json()["status"], still_blocked.json()["blocked_reason"]) == ("BLOCKED", reason)

    unblocked = client.put(f"/deliverables/{api_schema}", json={"status": "IN_PROGRESS"}, headers=pm)
    assert unblocked.status_code == 200, unblocked.text
    assert unblocked.json()["blocked_reason"] is None
    assert db_session.scalar(select(Deliverable.blocked_reason).where(Deliverable.id == api_schema)) is None

    ignored = client.put(f"/deliverables/{api_schema}", json={"blocked_reason": "Not blocked"}, headers=pm)
    assert ignored.json()["blocked_reason"] is None

    created = client.post(
        "/deliverables", json=new_body(world, status="NOT_STARTED", blocked_reason="Not blocked"), headers=pm
    )
    assert created.json()["blocked_reason"] is None

    payments = world.deliverables["Payments Service Integration"]
    blocked = client.put(
        f"/deliverables/{payments}", json={"status": "BLOCKED", "blocked_reason": "Waiting for the schema"}, headers=pm
    )
    assert (blocked.json()["status"], blocked.json()["blocked_reason"]) == ("BLOCKED", "Waiting for the schema")
    reworded = client.put(f"/deliverables/{payments}", json={"blocked_reason": "Schema review slipped"}, headers=pm)
    assert reworded.json()["blocked_reason"] == "Schema review slipped"


def test_updated_at_is_set_on_every_update(client: TestClient, world: World, db_session: Session) -> None:
    """Even an update that changes no value moves updated_at and writes an UPDATE audit row."""
    data_migration = world.deliverables["Data Migration Plan"]
    first = client.get(f"/deliverables/{data_migration}", headers=world.headers("PM")).json()
    same = client.put(
        f"/deliverables/{data_migration}", json={"title": "Data Migration Plan"}, headers=world.headers("PM")
    )
    assert same.status_code == 200, same.text
    assert parse_time(same.json()["updated_at"]) > parse_time(first["updated_at"])
    again = client.put(
        f"/deliverables/{data_migration}", json={"title": "Data Migration Plan"}, headers=world.headers("PM")
    )
    assert parse_time(again.json()["updated_at"]) > parse_time(same.json()["updated_at"])
    assert [row.action for row in audit_rows(db_session)] == ["UPDATE", "UPDATE"]


# --- Validation ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"start_date": "2026-03-10", "due_date": "2026-03-09"}, "due_date"),
        ({"completion_percentage": 101}, "completion_percentage"),
        ({"completion_percentage": -1}, "completion_percentage"),
        ({"completion_percentage": 50.5}, "completion_percentage"),
        ({"status": "FINISHED"}, "status"),
        ({"title": ""}, "title"),
        ({"title": "   "}, "title"),
        ({"title": "x" * 201}, "title"),
        ({"title": "Two\nlines"}, "title"),
        ({"description": "Has a NUL \x00 byte"}, "description"),
        ({"blocked_reason": "y" * 2001, "status": "BLOCKED"}, "blocked_reason"),
        ({"due_date": "2026-02-30"}, "due_date"),
        ({"due_date": None}, "due_date"),
        ({"project_id": 0}, "project_id"),
        ({"assigned_user_id": "abc"}, "assigned_user_id"),
        ({"is_overdue": True}, "is_overdue"),
    ],
)
def test_create_validation_errors(
    client: TestClient, world: World, db_session: Session, overrides: dict[str, Any], field: str
) -> None:
    """Bad bodies give 400 VALIDATION_ERROR naming the field, and change nothing."""
    before = deliverable_count(db_session)
    response = client.post("/deliverables", json=new_body(world, **overrides), headers=world.headers("PM"))
    assert error_of(response) == (400, "VALIDATION_ERROR"), response.text
    assert field in fields_of(response)
    assert deliverable_count(db_session) == before
    assert audit_rows(db_session) == []


@pytest.mark.parametrize("missing", ["project_id", "title", "due_date"])
def test_create_requires_project_title_and_due_date(client: TestClient, world: World, missing: str) -> None:
    """project_id, title and due_date are required."""
    body = new_body(world)
    del body[missing]
    response = client.post("/deliverables", json=body, headers=world.headers("PM"))
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert missing in fields_of(response)


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({}, "request"),
        ({"title": None}, "title"),
        ({"status": None}, "status"),
        ({"completion_percentage": None}, "completion_percentage"),
        ({"due_date": None}, "due_date"),
        ({"project_id": None}, "project_id"),
        ({"completion_percentage": 150}, "completion_percentage"),
        ({"owner": "someone"}, "owner"),
    ],
)
def test_update_validation_errors(
    client: TestClient, world: World, db_session: Session, body: dict[str, Any], field: str
) -> None:
    """An empty body, a null required field or a bad value gives 400 and no audit row."""
    response = client.put(f"/deliverables/{world.deliverables['API Schema']}", json=body, headers=world.headers("PM"))
    assert error_of(response) == (400, "VALIDATION_ERROR"), response.text
    assert field in fields_of(response)
    assert audit_rows(db_session) == []


def test_update_checks_dates_on_the_merged_values(client: TestClient, world: World, db_session: Session) -> None:
    """A start after the stored due date (or a due before the stored start) is rejected."""
    pm = world.headers("PM")
    payments = world.deliverables["Payments Service Integration"]
    due = world.today + timedelta(days=10)
    late_start = client.put(
        f"/deliverables/{payments}", json={"start_date": (due + timedelta(days=1)).isoformat()}, headers=pm
    )
    assert error_of(late_start) == (400, "VALIDATION_ERROR") and fields_of(late_start) == {"start_date"}

    ok = client.put(f"/deliverables/{payments}", json={"start_date": (due - timedelta(days=5)).isoformat()}, headers=pm)
    assert ok.status_code == 200, ok.text
    early_due = client.put(
        f"/deliverables/{payments}", json={"due_date": (due - timedelta(days=6)).isoformat()}, headers=pm
    )
    assert error_of(early_due) == (400, "VALIDATION_ERROR") and fields_of(early_due) == {"due_date"}

    both = client.put(
        f"/deliverables/{payments}",
        json={"start_date": None, "due_date": (due - timedelta(days=6)).isoformat()},
        headers=pm,
    )
    assert both.status_code == 200, both.text
    assert both.json()["start_date"] is None
    assert [row.action for row in audit_rows(db_session)] == ["UPDATE", "UPDATE"]


def test_project_id_is_immutable(client: TestClient, world: World, db_session: Session) -> None:
    """Moving a deliverable to another project is refused; repeating its own project is allowed."""
    pm = world.headers("PM")
    api_schema = world.deliverables["API Schema"]
    moved = client.put(f"/deliverables/{api_schema}", json={"project_id": world.projects["Beta"]}, headers=pm)
    assert error_of(moved) == (400, "VALIDATION_ERROR") and fields_of(moved) == {"project_id"}
    assert db_session.scalar(select(Deliverable.project_id).where(Deliverable.id == api_schema)) == world.projects[
        "Alpha"
    ]
    same = client.put(
        f"/deliverables/{api_schema}",
        json={"project_id": world.projects["Alpha"], "title": "API Schema v2"},
        headers=pm,
    )
    assert same.status_code == 200, same.text
    assert (same.json()["project_id"], same.json()["title"]) == (world.projects["Alpha"], "API Schema v2")


def test_unknown_project_or_assignee_is_an_invalid_reference(
    client: TestClient, world: World, db_session: Session
) -> None:
    """Unknown project or assignee ids give 400 INVALID_REFERENCE naming each field; nothing is written."""
    pm = world.headers("PM")
    unknown_project = client.post("/deliverables", json=new_body(world, project_id=MISSING_ID), headers=pm)
    assert error_of(unknown_project) == (400, "INVALID_REFERENCE") and fields_of(unknown_project) == {"project_id"}

    unknown_user = client.post("/deliverables", json=new_body(world, assigned_user_id=MISSING_ID), headers=pm)
    assert error_of(unknown_user) == (400, "INVALID_REFERENCE") and fields_of(unknown_user) == {"assigned_user_id"}

    both = client.post(
        "/deliverables", json=new_body(world, project_id=MISSING_ID, assigned_user_id=MISSING_ID), headers=pm
    )
    assert fields_of(both) == {"project_id", "assigned_user_id"}

    on_update = client.put(
        f"/deliverables/{world.deliverables['API Schema']}", json={"assigned_user_id": MISSING_ID}, headers=pm
    )
    assert error_of(on_update) == (400, "INVALID_REFERENCE") and fields_of(on_update) == {"assigned_user_id"}
    assert deliverable_count(db_session) == 21
    assert audit_rows(db_session) == []


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", f"/deliverables/{MISSING_ID}"),
        ("PUT", f"/deliverables/{MISSING_ID}"),
        ("DELETE", f"/deliverables/{MISSING_ID}"),
        ("GET", f"/deliverables/{MISSING_ID}/impact"),
    ],
)
def test_missing_deliverable_is_404(client: TestClient, world: World, method: str, path: str) -> None:
    """Every route on an unknown id gives 404 NOT_FOUND in the standard shape."""
    body = {"title": "Anything"} if method == "PUT" else None
    response = client.request(method, path, json=body, headers=world.headers("ADMIN"))
    assert error_of(response) == (404, "NOT_FOUND")
    assert set(response.json()) == {"error", "message", "details"}


@pytest.mark.parametrize("bad_id", ["0", "abc", "-4", "99999999999999999999"])
def test_malformed_deliverable_id_is_400(client: TestClient, world: World, bad_id: str) -> None:
    """A path id that is not a positive BIGINT gives 400 VALIDATION_ERROR."""
    response = client.get(f"/deliverables/{bad_id}", headers=world.headers("ADMIN"))
    assert error_of(response) == (400, "VALIDATION_ERROR")


# --- Permissions (spec section 7) ---------------------------------------------------------------------


def test_viewer_can_read_but_not_write(client: TestClient, world: World, db_session: Session) -> None:
    """VIEWER reads every deliverable route; create, update and delete give 403 and change nothing."""
    viewer = world.headers("VIEWER")
    api_schema = world.deliverables["API Schema"]
    assert client.get("/deliverables", headers=viewer).status_code == 200
    assert client.get(f"/deliverables/{api_schema}", headers=viewer).status_code == 200
    assert client.get(f"/deliverables/{api_schema}/impact", headers=viewer).status_code == 200
    assert error_of(client.post("/deliverables", json=new_body(world), headers=viewer)) == (403, "ACCESS_DENIED")
    assert error_of(client.put(f"/deliverables/{api_schema}", json={"title": "X"}, headers=viewer)) == (
        403,
        "ACCESS_DENIED",
    )
    assert error_of(client.delete(f"/deliverables/{api_schema}", headers=viewer)) == (403, "ACCESS_DENIED")
    assert deliverable_count(db_session) == 21
    assert db_session.scalar(select(Deliverable.title).where(Deliverable.id == api_schema)) == "API Schema"
    assert audit_rows(db_session) == []


def test_lead_can_create_and_update_but_not_delete(client: TestClient, world: World, db_session: Session) -> None:
    """LEAD (Contributor) creates and updates deliverables; delete gives 403 ACCESS_DENIED."""
    lead = world.headers("LEAD")
    created = client.post("/deliverables", json=new_body(world), headers=lead)
    assert created.status_code == 201, created.text
    item_id = created.json()["id"]
    assert client.put(f"/deliverables/{item_id}", json={"completion_percentage": 5}, headers=lead).status_code == 200
    denied = client.delete(f"/deliverables/{item_id}", headers=lead)
    assert error_of(denied) == (403, "ACCESS_DENIED")
    assert db_session.scalar(select(Deliverable.id).where(Deliverable.id == item_id)) == item_id
    assert [row.action for row in audit_rows(db_session)] == ["CREATE", "UPDATE"]


@pytest.mark.parametrize("role", ["ADMIN", "PM"])
def test_admin_and_pm_can_delete(client: TestClient, world: World, role: str) -> None:
    """ADMIN and PM (Manager) delete deliverables."""
    response = client.delete(f"/deliverables/{world.deliverables['Launch Event']}", headers=world.headers(role))
    assert response.status_code == 204


def test_every_route_needs_a_token(client: TestClient, world: World) -> None:
    """Without a token every deliverable route gives 401 UNAUTHENTICATED."""
    api_schema = world.deliverables["API Schema"]
    for method, path in [
        ("GET", "/deliverables"),
        ("POST", "/deliverables"),
        ("GET", f"/deliverables/{api_schema}"),
        ("PUT", f"/deliverables/{api_schema}"),
        ("DELETE", f"/deliverables/{api_schema}"),
        ("GET", f"/deliverables/{api_schema}/impact"),
    ]:
        assert error_of(client.request(method, path)) == (401, "UNAUTHENTICATED"), (method, path)


# --- Downstream impact ---------------------------------------------------------------------------------


def test_impact_of_api_schema(client: TestClient, world: World) -> None:
    """API Schema holds up Payments (1), Mobile (1) and End-to-End Testing (2), nearest first."""
    api_schema = world.deliverables["API Schema"]
    response = client.get(f"/deliverables/{api_schema}/impact", headers=world.headers("VIEWER"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["deliverable_id"], body["title"], body["total"]) == (api_schema, "API Schema", 3)
    assert [(item["title"], item["depth"], item["status"]) for item in body["items"]] == [
        ("Payments Service Integration", 1, "IN_PROGRESS"),
        ("Mobile Client Integration", 1, "NOT_STARTED"),
        ("End-to-End Testing", 2, "NOT_STARTED"),
    ]
    assert all(set(item) == {"id", "title", "project_id", "status", "depth"} for item in body["items"])
    assert {item["project_id"] for item in body["items"]} == {world.projects["Alpha"]}


def test_impact_includes_done_items_other_projects_and_leaves(
    client: TestClient, world: World, db_session: Session
) -> None:
    """Impact walks every edge (also across projects) and lists DONE items too; a leaf has none."""
    sign_off = world.deliverables["Requirements Sign-off"]
    deep = client.get(f"/deliverables/{sign_off}/impact", headers=world.headers("PM")).json()
    assert [(item["title"], item["depth"]) for item in deep["items"]] == [
        ("API Schema", 1),
        ("Payments Service Integration", 2),
        ("Mobile Client Integration", 2),
        ("End-to-End Testing", 3),
    ]
    leaf = client.get(f"/deliverables/{world.deliverables['End-to-End Testing']}/impact", headers=world.headers("PM"))
    assert leaf.json()["items"] == [] and leaf.json()["total"] == 0

    db_session.add(
        DeliverableDependency(
            predecessor_deliverable_id=world.deliverables["End-to-End Testing"],
            successor_deliverable_id=world.deliverables["Rollout"],
        )
    )
    db_session.commit()
    crossing = client.get(f"/deliverables/{world.deliverables['API Schema']}/impact", headers=world.headers("PM"))
    last = crossing.json()["items"][-1]
    assert (last["title"], last["depth"], last["status"], last["project_id"]) == (
        "Rollout",
        3,
        "DONE",
        world.projects["Epsilon"],
    )


# --- Audit ---------------------------------------------------------------------------------------------


def test_each_mutation_writes_exactly_one_audit_row(client: TestClient, world: World, db_session: Session) -> None:
    """CREATE, UPDATE and DELETE each write one deliverable audit row with the actor and the states."""
    pm = world.headers("PM")
    pm_id = world.user_ids["Vikram Shah"]
    created = client.post("/deliverables", json=new_body(world), headers=pm).json()
    rows = audit_rows(db_session)
    assert len(rows) == 1
    assert (rows[0].action, rows[0].entity_id, rows[0].actor_id) == ("CREATE", created["id"], pm_id)
    assert rows[0].before_state is None and rows[0].after_state["title"] == "Fraud Rules Review"

    client.put(f"/deliverables/{created['id']}", json={"status": "DONE"}, headers=pm)
    rows = audit_rows(db_session)
    assert len(rows) == 2 and rows[1].action == "UPDATE"
    assert (rows[1].before_state["status"], rows[1].before_state["completion_percentage"]) == ("NOT_STARTED", 0)
    assert (rows[1].after_state["status"], rows[1].after_state["completion_percentage"]) == ("DONE", 100)
    assert parse_time(rows[1].after_state["updated_at"]) > parse_time(rows[1].before_state["updated_at"])

    client.delete(f"/deliverables/{created['id']}", headers=pm)
    rows = audit_rows(db_session)
    assert len(rows) == 3
    assert (rows[2].action, rows[2].entity_id, rows[2].after_state) == ("DELETE", created["id"], None)
    assert rows[2].before_state["status"] == "DONE"


def test_delete_removes_edges_unlinks_allocations_and_audits_both(
    client: TestClient, world: World, db_session: Session
) -> None:
    """Deleting API Schema removes its three edges and unlinks Priya's allocation; the audit row lists both."""
    api_schema = world.deliverables["API Schema"]
    allocation_id = db_session.scalar(
        select(ResourceAllocation.id).where(ResourceAllocation.deliverable_id == api_schema)
    )
    response = client.delete(f"/deliverables/{api_schema}", headers=world.headers("PM"))
    assert response.status_code == 204, response.text
    assert db_session.scalar(select(func.count()).select_from(DeliverableDependency)) == 11
    assert db_session.scalar(
        select(ResourceAllocation.deliverable_id).where(ResourceAllocation.id == allocation_id)
    ) is None
    (row,) = audit_rows(db_session)
    assert row.action == "DELETE" and row.entity_id == api_schema
    removed = row.before_state["removed_dependencies"]
    assert {(edge["predecessor_deliverable_id"], edge["successor_deliverable_id"]) for edge in removed} == {
        (world.deliverables["Requirements Sign-off"], api_schema),
        (api_schema, world.deliverables["Payments Service Integration"]),
        (api_schema, world.deliverables["Mobile Client Integration"]),
    }
    assert row.before_state["unlinked_allocation_ids"] == [allocation_id]
    assert audit_rows(db_session, "dependency") == []


# --- Concurrency ---------------------------------------------------------------------------------------


def test_project_deleted_during_create_is_an_invalid_reference(world: World, db_session: Session) -> None:
    """A project deleted by another transaction after the existence check gives 400, not a 500.

    The other transaction deletes the project but has not committed, so the
    create still sees the project, then its foreign-key check waits on the
    deleted row. Once the delete commits, the insert fails and the service
    reports the same 400 INVALID_REFERENCE as an unknown project, writing nothing.
    """
    department_id = db_session.scalar(select(Project.department_id).where(Project.id == world.projects["Alpha"]))
    doomed = Project(
        project_name="Short-lived",
        department_id=department_id,
        start_date=world.today,
        end_date=world.today + timedelta(days=30),
    )
    db_session.add(doomed)
    db_session.commit()
    settings = get_settings()
    engine = create_engine(build_url(settings), connect_args=build_connect_args(settings), poolclass=NullPool)
    make_session = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    pids: dict[str, int] = {}
    outcome: dict[str, tuple[str, str]] = {}

    def create() -> None:
        session = make_session()
        try:
            pids["create"] = session.scalar(text("SELECT pg_backend_pid()"))
            actor = session.get(User, world.user_ids["Vikram Shah"])
            data = DeliverableCreate(project_id=doomed.id, title="Orphan", due_date=world.today + timedelta(days=5))
            deliverables_service.create_deliverable(session, actor=actor, data=data)
            outcome["create"] = ("created", "")
        except AppError as exc:
            outcome["create"] = (exc.error, exc.message)
        except Exception as exc:  # noqa: BLE001 - surfaced by the assertion below
            outcome["create"] = ("exception", repr(exc))
        finally:
            session.close()

    deleter = make_session()
    thread = threading.Thread(target=create)
    try:
        deleter.execute(delete(Project).where(Project.id == doomed.id))
        thread.start()
        waiting: set[int] = set()
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            with engine.connect() as probe:
                waiting = set(probe.scalars(text("SELECT pid FROM pg_locks WHERE NOT granted")))
            if pids.get("create") in waiting:
                break
            time.sleep(0.05)
        assert pids.get("create") in waiting, (pids, waiting, outcome)
        assert outcome == {}, "the create must be waiting on the deleted project row"
        deleter.commit()
    finally:
        deleter.close()
        thread.join(timeout=30)
        engine.dispose()

    assert outcome == {"create": ("INVALID_REFERENCE", "The project or the assignee no longer exists.")}
    assert db_session.scalar(select(func.count()).select_from(Deliverable).where(Deliverable.title == "Orphan")) == 0
    assert audit_rows(db_session) == []
