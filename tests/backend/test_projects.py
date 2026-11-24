"""Projects API: computed metrics, filters, validation, RBAC and audit (spec 6, 7, 8, 9, 10, 13.1)."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AuditLog,
    BudgetEntry,
    Deliverable,
    DeliverableDependency,
    Department,
    Project,
    ResourceAllocation,
    User,
)
from app.db.seed import seed_portfolio
from app.security import create_access_token
from conftest import TEST_PASSWORD

# The seed's anchor date; every request that computes metrics passes as_of=T.
T = date(2026, 11, 25)

ROLE_EMAILS = {
    "ADMIN": "admin@acme.example",
    "PM": "pm@acme.example",
    "LEAD": "lead@acme.example",
    "VIEWER": "viewer@acme.example",
}

PROJECT_KEYS = {
    "id",
    "project_name",
    "description",
    "department_id",
    "department_name",
    "project_manager_id",
    "project_manager_name",
    "start_date",
    "end_date",
    "planned_budget",
    "status",
    "created_at",
    "updated_at",
    "completion_pct",
    "actual_spend",
    "remaining_budget",
    "utilization_pct",
    "risk_score",
    "risk_level",
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


def fields_of(response: httpx.Response) -> list[str]:
    """Field names in an error response's details."""
    return [detail["field"] for detail in response.json()["details"]]


def short_name(project_name: str) -> str:
    """'Project Alpha: Customer Payments Platform' -> 'Alpha'."""
    return project_name.split(":")[0].removeprefix("Project ")


@dataclass(frozen=True)
class Seeded:
    """Ids from the spec section 10 seed, plus a header per demo role."""

    project_ids: dict[str, int]
    user_ids: dict[str, int]
    department_ids: dict[str, int]
    deliverable_ids: dict[str, int]
    headers: dict[str, dict[str, str]]


@pytest.fixture
def seeded(db_session: Session) -> Seeded:
    """Seed the spec section 10 portfolio at the fixed date ``T`` and commit it."""
    seed_portfolio(db_session, TEST_PASSWORD, today=T)
    db_session.commit()
    users = {user.email: user for user in db_session.scalars(select(User))}
    return Seeded(
        project_ids={short_name(p.project_name): p.id for p in db_session.scalars(select(Project))},
        user_ids={email: user.id for email, user in users.items()},
        department_ids={d.name: d.id for d in db_session.scalars(select(Department))},
        deliverable_ids={d.title: d.id for d in db_session.scalars(select(Deliverable))},
        headers={role: headers_for(users[email]) for role, email in ROLE_EMAILS.items()},
    )


def audit_rows(db: Session) -> list[AuditLog]:
    """Every audit row, oldest first, read fresh from the database."""
    db.expire_all()
    return list(db.scalars(select(AuditLog).order_by(AuditLog.id)))


def count(db: Session, model: type[Any], *conditions: Any) -> int:
    """Number of rows in a model's table matching the conditions."""
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0


def list_projects(client: TestClient, headers: dict[str, str], **params: Any) -> dict[str, Any]:
    """GET /projects as of T with the given filters; returns the JSON body."""
    response = client.get("/projects", params={"as_of": T.isoformat(), **params}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def by_name(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Index a project list by short name."""
    return {short_name(item["project_name"]): item for item in body["items"]}


def new_project_body(department_id: int, /, **overrides: Any) -> dict[str, Any]:
    """A valid POST /projects body: PLANNED, T to T+100, 250,000 planned; overrides may replace any field."""
    body: dict[str, Any] = {
        "project_name": "Project Zeta: Data Platform",
        "description": "  Consolidate reporting data.  ",
        "department_id": department_id,
        "start_date": day(0),
        "end_date": day(100),
        "planned_budget": "250000",
    }
    body.update(overrides)
    return body


# --- Computed metrics (golden values, spec section 10) ----------------------------------------------


def test_alpha_carries_the_golden_metrics(client: TestClient, seeded: Seeded) -> None:
    """GET /projects?as_of=T: Alpha is CRITICAL 78 at 35.0% complete and 75.0% spent, money as strings."""
    body = list_projects(client, seeded.headers["PM"])
    assert body["total"] == 5
    alpha = by_name(body)["Alpha"]
    assert set(alpha) == PROJECT_KEYS
    assert (alpha["risk_score"], alpha["risk_level"]) == (78, "CRITICAL")
    assert alpha["completion_pct"] == 35.0 and isinstance(alpha["completion_pct"], float)
    assert alpha["utilization_pct"] == 75.0 and isinstance(alpha["utilization_pct"], float)
    assert alpha["actual_spend"] == "300000.00"
    assert alpha["remaining_budget"] == "100000.00"
    assert alpha["planned_budget"] == "400000.00"
    assert alpha["status"] == "ACTIVE"
    assert (alpha["start_date"], alpha["end_date"]) == (day(-60), day(25))
    assert (alpha["department_id"], alpha["department_name"]) == (seeded.department_ids["Engineering"], "Engineering")
    assert alpha["project_manager_id"] == seeded.user_ids["pm@acme.example"]
    assert alpha["project_manager_name"] == "Vikram Shah"


@pytest.mark.parametrize(
    ("key", "score", "level", "completion", "utilization", "spent", "remaining"),
    [
        ("Alpha", 78, "CRITICAL", 35.0, 75.0, "300000.00", "100000.00"),
        ("Beta", 31, "MEDIUM", 50.0, 70.0, "105000.00", "45000.00"),
        ("Gamma", 0, "LOW", 60.0, 55.0, "137500.00", "112500.00"),
        ("Delta", 61, "HIGH", 55.0, 105.0, "210000.00", "-10000.00"),
        ("Epsilon", 0, "LOW", 100.0, 95.0, "76000.00", "4000.00"),
    ],
)
def test_every_seeded_project_matches_the_golden_table(
    client: TestClient,
    seeded: Seeded,
    key: str,
    score: int,
    level: str,
    completion: float,
    utilization: float,
    spent: str,
    remaining: str,
) -> None:
    """Each row of the spec section 10 golden table, as served by the list and by GET /projects/{id}."""
    listed = by_name(list_projects(client, seeded.headers["VIEWER"]))[key]
    expected = (score, level, completion, utilization, spent, remaining)
    keys = ("risk_score", "risk_level", "completion_pct", "utilization_pct", "actual_spend", "remaining_budget")
    assert tuple(listed[k] for k in keys) == expected
    single = client.get(
        f"/projects/{seeded.project_ids[key]}", params={"as_of": T.isoformat()}, headers=seeded.headers["LEAD"]
    )
    assert single.status_code == 200 and single.json() == listed


def test_metrics_follow_the_as_of_date(client: TestClient, seeded: Seeded) -> None:
    """as_of reaches the engines: 40 days on, Alpha's deadline has passed and the scores change."""
    later = client.get(
        f"/projects/{seeded.project_ids['Alpha']}", params={"as_of": day(40)}, headers=seeded.headers["PM"]
    ).json()
    # Schedule 20 (5 overdue, capped), blocked 10, blast 0 (every successor is now a root cause itself),
    # resource 0 (Priya's conflict ended), budget 15, deadline 10 (end date passed).
    assert (later["risk_score"], later["risk_level"]) == (55, "HIGH")
    assert later["completion_pct"] == 35.0 and later["actual_spend"] == "300000.00"


def test_as_of_defaults_to_today_utc(client: TestClient, seeded: Seeded, monkeypatch: pytest.MonkeyPatch) -> None:
    """Without as_of the router uses today's UTC date (patched to T here)."""
    import app.api.projects as projects_api

    monkeypatch.setattr(projects_api, "today_utc", lambda: T)
    listed = client.get("/projects", headers=seeded.headers["PM"]).json()
    assert by_name(listed)["Alpha"]["risk_score"] == 78
    single = client.get(f"/projects/{seeded.project_ids['Delta']}", headers=seeded.headers["PM"]).json()
    assert (single["risk_score"], single["risk_level"]) == (61, "HIGH")


# --- Filters and pagination -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("level", "names"),
    [("CRITICAL", ["Alpha"]), ("HIGH", ["Delta"]), ("MEDIUM", ["Beta"]), ("LOW", ["Gamma", "Epsilon"])],
)
def test_risk_level_filter_uses_the_computed_levels(
    client: TestClient, seeded: Seeded, level: str, names: list[str]
) -> None:
    """risk_level filters on the level computed as of T: CRITICAL returns only Alpha."""
    body = list_projects(client, seeded.headers["PM"], risk_level=level)
    assert [short_name(item["project_name"]) for item in body["items"]] == names
    assert body["total"] == len(names)
    assert all(item["risk_level"] == level for item in body["items"])


def test_risk_level_filter_counts_before_paging(client: TestClient, seeded: Seeded) -> None:
    """total counts every match of the computed filter; limit and offset slice afterwards."""
    body = list_projects(client, seeded.headers["PM"], risk_level="LOW", limit=1, offset=1)
    assert [short_name(item["project_name"]) for item in body["items"]] == ["Epsilon"] and body["total"] == 2


def test_list_filters_and_pagination(client: TestClient, seeded: Seeded) -> None:
    """q (name contains, any case), department_id and status combine; lists are ordered by id."""
    headers = seeded.headers["VIEWER"]
    everything = list_projects(client, headers)
    assert [short_name(item["project_name"]) for item in everything["items"]] == [
        "Alpha",
        "Beta",
        "Gamma",
        "Delta",
        "Epsilon",
    ]
    assert list(by_name(list_projects(client, headers, q="ALPHA"))) == ["Alpha"]
    assert list_projects(client, headers, q="project")["total"] == 5
    assert list(by_name(list_projects(client, headers, q="  ledger "))) == ["Gamma"]
    assert list_projects(client, headers, q="%") == {"items": [], "total": 0}
    assert list(by_name(list_projects(client, headers, department_id=seeded.department_ids["Finance"]))) == ["Gamma"]
    assert list(by_name(list_projects(client, headers, status="COMPLETED"))) == ["Epsilon"]
    assert list_projects(client, headers, status="ON_HOLD") == {"items": [], "total": 0}
    combined = list_projects(
        client, headers, status="ACTIVE", department_id=seeded.department_ids["Engineering"], risk_level="CRITICAL"
    )
    assert list(by_name(combined)) == ["Alpha"]
    assert list_projects(client, headers, q="beta", risk_level="CRITICAL") == {"items": [], "total": 0}
    page = list_projects(client, headers, limit=2, offset=1)
    assert list(by_name(page)) == ["Beta", "Gamma"] and page["total"] == 5
    assert list_projects(client, headers, offset=10) == {"items": [], "total": 5}


def test_list_without_projects_is_empty(client: TestClient, auth_headers: Callable[..., dict[str, str]]) -> None:
    """An empty portfolio lists nothing."""
    response = client.get("/projects", headers=auth_headers("VIEWER"))
    assert response.status_code == 200 and response.json() == {"items": [], "total": 0}


@pytest.mark.parametrize(
    "params",
    [
        {"status": "DONE"},
        {"risk_level": "SEVERE"},
        {"as_of": "2026-13-01"},
        {"as_of": "yesterday"},
        {"department_id": 0},
        {"department_id": "abc"},
        {"limit": 201},
        {"limit": 0},
        {"offset": -1},
        {"q": "x" * 201},
        {"q": "a\x00"},
        {"q": "line\nbreak"},
    ],
)
def test_list_rejects_bad_query_parameters(client: TestClient, seeded: Seeded, params: dict[str, Any]) -> None:
    """Bad filters, dates, paging and search text are 400 VALIDATION_ERROR naming the parameter, never 422."""
    response = client.get("/projects", params=params, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert fields_of(response) == list(params)


def bound_texts(parameters: Any) -> list[str]:
    """Every string bound to one SQL statement (a dict, or a sequence of them for executemany)."""
    rows = parameters if isinstance(parameters, (list, tuple)) else [parameters]
    texts: list[str] = []
    for row in rows:
        values = row.values() if isinstance(row, dict) else [row]
        texts.extend(value for value in values if isinstance(value, str))
    return texts


@pytest.mark.parametrize("term", ["\x00", "a\x00b"])
def test_search_with_nul_is_refused_before_any_sql(
    client: TestClient, seeded: Seeded, db_session: Session, term: str
) -> None:
    """q goes through the shared SearchText guard, as on /users and /departments: 400 on q, never sent to SQL.

    PostgreSQL cannot compare NUL. Unguarded, the term reached the database, psycopg
    raised DataError and the generic backstop answered 400 without naming the field.
    """
    engine = db_session.get_bind()

    def search(text: str) -> tuple[httpx.Response, list[str]]:
        """GET /projects?q=text; return the response and every string bound to SQL meanwhile."""
        sent: list[str] = []

        def record(conn: Any, cursor: Any, statement: str, parameters: Any, *args: Any) -> None:
            sent.extend(bound_texts(parameters))

        event.listen(engine, "before_cursor_execute", record)
        try:
            response = client.get("/projects", params={"q": text}, headers=seeded.headers["PM"])
        finally:
            event.remove(engine, "before_cursor_execute", record)
        return response, sent

    control, control_sent = search("alpha")
    assert control.status_code == 200 and [text for text in control_sent if "alpha" in text]
    response, sent = search(term)
    assert error_of(response) == (400, "VALIDATION_ERROR")
    details = response.json()["details"]
    assert [detail["field"] for detail in details] == ["q"]
    assert "control characters" in details[0]["issue"]
    assert not [text for text in sent if "\x00" in text]


def test_reads_run_a_fixed_number_of_queries(client: TestClient, seeded: Seeded, db_session: Session) -> None:
    """One portfolio analysis per request: adding projects does not add queries."""
    engine = db_session.get_bind()

    def statements_for(path: str) -> int:
        """Count the SQL statements one GET sends."""
        statements: list[str] = []

        def record(conn: Any, cursor: Any, statement: str, *args: Any) -> None:
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", record)
        try:
            response = client.get(path, params={"as_of": T.isoformat()}, headers=seeded.headers["PM"])
        finally:
            event.remove(engine, "before_cursor_execute", record)
        assert response.status_code == 200, response.text
        return len(statements)

    alpha_path = f"/projects/{seeded.project_ids['Alpha']}"
    before_list, before_one = statements_for("/projects"), statements_for(alpha_path)
    department_id = seeded.department_ids["Operations"]
    for index in range(6):
        project = Project(
            project_name=f"Extra {index}",
            department_id=department_id,
            start_date=T,
            end_date=T + timedelta(days=30),
            status="ACTIVE",
        )
        db_session.add(project)
        db_session.flush()
        db_session.add(Deliverable(project_id=project.id, title=f"Work {index}", due_date=T - timedelta(days=1)))
        db_session.add(BudgetEntry(project_id=project.id, category="OTHER", amount=1, entry_date=T))
    db_session.commit()
    assert statements_for("/projects") == before_list
    assert statements_for(alpha_path) == before_one
    assert list_projects(client, seeded.headers["PM"])["total"] == 11


def test_a_project_deleted_between_the_reads_is_left_out(
    client: TestClient, seeded: Seeded, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The rows are read before the portfolio snapshot: one missing from the snapshot was deleted in between.

    The list leaves it out and GET /projects/{id} answers 404, instead of failing on a missing result.
    """
    import app.services.projects as projects_service
    from app.engines.types import PortfolioSnapshot

    monkeypatch.setattr(projects_service, "load_snapshot", lambda db: PortfolioSnapshot())
    assert list_projects(client, seeded.headers["PM"]) == {"items": [], "total": 0}
    response = client.get(f"/projects/{seeded.project_ids['Alpha']}", headers=seeded.headers["PM"])
    assert error_of(response) == (404, "NOT_FOUND")


# --- Read one ---------------------------------------------------------------------------------------


def test_get_missing_or_malformed_project(client: TestClient, seeded: Seeded) -> None:
    """Unknown ids are 404 NOT_FOUND; malformed ids and dates are 400."""
    headers = seeded.headers["VIEWER"]
    assert error_of(client.get("/projects/999999", headers=headers)) == (404, "NOT_FOUND")
    assert error_of(client.get("/projects/0", headers=headers)) == (400, "VALIDATION_ERROR")
    assert error_of(client.get("/projects/abc", headers=headers)) == (400, "VALIDATION_ERROR")
    bad_date = client.get(f"/projects/{seeded.project_ids['Alpha']}", params={"as_of": "2026-02-30"}, headers=headers)
    assert error_of(bad_date) == (400, "VALIDATION_ERROR") and fields_of(bad_date) == ["as_of"]


# --- Create -----------------------------------------------------------------------------------------


def test_create_project_returns_it_with_metrics(client: TestClient, seeded: Seeded) -> None:
    """POST is 201 with the stored fields normalised and the computed metrics of a fresh project."""
    body = new_project_body(seeded.department_ids["Engineering"], project_manager_id=seeded.user_ids["pm@acme.example"])
    response = client.post("/projects", params={"as_of": T.isoformat()}, json=body, headers=seeded.headers["PM"])
    assert response.status_code == 201, response.text
    created = response.json()
    assert set(created) == PROJECT_KEYS
    assert created["project_name"] == "Project Zeta: Data Platform"
    assert created["description"] == "Consolidate reporting data."
    assert (created["status"], created["planned_budget"]) == ("PLANNED", "250000.00")
    assert (created["department_name"], created["project_manager_name"]) == ("Engineering", "Vikram Shah")
    assert (created["start_date"], created["end_date"]) == (day(0), day(100))
    assert created["completion_pct"] == 0.0 and created["utilization_pct"] == 0.0
    assert (created["actual_spend"], created["remaining_budget"]) == ("0.00", "250000.00")
    assert (created["risk_score"], created["risk_level"]) == (0, "LOW")
    assert created["created_at"] == created["updated_at"]
    fetched = client.get(f"/projects/{created['id']}", params={"as_of": T.isoformat()}, headers=seeded.headers["LEAD"])
    assert fetched.status_code == 200 and fetched.json() == created
    assert list_projects(client, seeded.headers["PM"])["total"] == 6


def test_create_project_minimal_body_and_risk_on_create(client: TestClient, seeded: Seeded) -> None:
    """Defaults: no manager, PLANNED, budget 0.00 (utilization null); a near deadline scores at once."""
    body = {
        "project_name": "Quick Fix",
        "department_id": seeded.department_ids["Operations"],
        "start_date": day(0),
        "end_date": day(20),
    }
    response = client.post("/projects", params={"as_of": T.isoformat()}, json=body, headers=seeded.headers["ADMIN"])
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["description"] is None and created["project_manager_id"] is None
    assert created["project_manager_name"] is None
    assert (created["status"], created["planned_budget"], created["utilization_pct"]) == ("PLANNED", "0.00", None)
    # Ends within 30 days at 0% complete: the deadline factor gives 10 points.
    assert (created["risk_score"], created["risk_level"]) == (10, "LOW")


def test_create_accepts_equal_dates_and_the_largest_budget(client: TestClient, seeded: Seeded) -> None:
    """end_date may equal start_date; 12 integer digits with 2 decimals fit NUMERIC(14, 2)."""
    body = new_project_body(
        seeded.department_ids["Finance"], end_date=day(0), planned_budget="999999999999.99", status="ON_HOLD"
    )
    response = client.post("/projects", json=body, headers=seeded.headers["PM"])
    assert response.status_code == 201, response.text
    assert response.json()["planned_budget"] == "999999999999.99" and response.json()["status"] == "ON_HOLD"


def test_create_rejects_an_end_date_before_the_start(client: TestClient, seeded: Seeded) -> None:
    """end_date before start_date is 400 VALIDATION_ERROR on end_date."""
    body = new_project_body(seeded.department_ids["Finance"], start_date=day(10), end_date=day(9))
    response = client.post("/projects", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == ["end_date"]


@pytest.mark.parametrize(
    ("field", "value"),
    [("department_id", 999999), ("project_manager_id", 999999)],
)
def test_create_rejects_unknown_references(client: TestClient, seeded: Seeded, field: str, value: int) -> None:
    """A department or project manager that does not exist is 400 INVALID_REFERENCE naming the field."""
    body = new_project_body(seeded.department_ids["Finance"])
    body[field] = value
    response = client.post("/projects", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "INVALID_REFERENCE") and fields_of(response) == [field]
    assert list_projects(client, seeded.headers["PM"])["total"] == 5


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"project_name": ""}, "project_name"),
        ({"project_name": "   "}, "project_name"),
        ({"project_name": "x" * 201}, "project_name"),
        ({"project_name": "Tab\there"}, "project_name"),
        ({"project_name": None}, "project_name"),
        ({"description": "nul\x00byte"}, "description"),
        ({"planned_budget": "-0.01"}, "planned_budget"),
        ({"planned_budget": "1.001"}, "planned_budget"),
        ({"planned_budget": 12.345}, "planned_budget"),
        ({"planned_budget": "1000000000000"}, "planned_budget"),
        ({"planned_budget": "NaN"}, "planned_budget"),
        ({"planned_budget": "Infinity"}, "planned_budget"),
        ({"planned_budget": True}, "planned_budget"),
        ({"planned_budget": None}, "planned_budget"),
        ({"status": "DONE"}, "status"),
        ({"status": "active"}, "status"),
        ({"department_id": 0}, "department_id"),
        ({"department_id": True}, "department_id"),
        ({"department_id": None}, "department_id"),
        ({"project_manager_id": -4}, "project_manager_id"),
        ({"start_date": "2026-02-30"}, "start_date"),
        ({"end_date": "next week"}, "end_date"),
        ({"actual_budget": "5"}, "actual_budget"),
    ],
)
def test_create_validates_the_body(
    client: TestClient, seeded: Seeded, overrides: dict[str, Any], field: str
) -> None:
    """Bad values and unknown fields are 400 VALIDATION_ERROR naming the field; nothing is created."""
    body = new_project_body(seeded.department_ids["Finance"], **overrides)
    response = client.post("/projects", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert fields_of(response) == [field]
    assert list_projects(client, seeded.headers["PM"])["total"] == 5


@pytest.mark.parametrize("missing", ["project_name", "department_id", "start_date", "end_date"])
def test_create_requires_the_core_fields(client: TestClient, seeded: Seeded, missing: str) -> None:
    """Name, department and both dates are required."""
    body = new_project_body(seeded.department_ids["Finance"])
    del body[missing]
    response = client.post("/projects", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == [missing]


# --- Update -----------------------------------------------------------------------------------------


def test_update_project_fields(client: TestClient, seeded: Seeded) -> None:
    """PUT changes only the fields sent, refreshes names and metrics, and bumps updated_at."""
    alpha_id = seeded.project_ids["Alpha"]
    headers = seeded.headers["PM"]
    before = client.get(f"/projects/{alpha_id}", params={"as_of": T.isoformat()}, headers=headers).json()
    response = client.put(
        f"/projects/{alpha_id}",
        params={"as_of": T.isoformat()},
        json={
            "project_name": "  Project Alpha: Payments Platform  ",
            "department_id": seeded.department_ids["Finance"],
            "project_manager_id": seeded.user_ids["kabir.sethi@acme.example"],
            "planned_budget": 600000,
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["project_name"] == "Project Alpha: Payments Platform"
    assert (updated["department_name"], updated["project_manager_name"]) == ("Finance", "Kabir Sethi")
    assert (updated["planned_budget"], updated["remaining_budget"], updated["utilization_pct"]) == (
        "600000.00",
        "300000.00",
        50.0,
    )
    unchanged = ("description", "start_date", "end_date", "status", "created_at", "actual_spend", "completion_pct")
    assert all(updated[key] == before[key] for key in unchanged)
    assert datetime.fromisoformat(updated["updated_at"]) > datetime.fromisoformat(before["updated_at"])

    cleared = client.put(
        f"/projects/{alpha_id}",
        params={"as_of": T.isoformat()},
        json={"description": None, "project_manager_id": None, "status": "COMPLETED"},
        headers=headers,
    ).json()
    assert cleared["description"] is None
    assert cleared["project_manager_id"] is None and cleared["project_manager_name"] is None
    # COMPLETED projects are not scored (spec section 9.4).
    assert (cleared["status"], cleared["risk_score"], cleared["risk_level"]) == ("COMPLETED", 0, "LOW")
    assert datetime.fromisoformat(cleared["updated_at"]) > datetime.fromisoformat(updated["updated_at"])


def test_update_sets_updated_at_even_without_changes(
    client: TestClient, seeded: Seeded, db_session: Session
) -> None:
    """Sending the current value still counts as an update: updated_at moves on and one audit row is written."""
    beta_id = seeded.project_ids["Beta"]
    headers = seeded.headers["ADMIN"]
    before = client.get(f"/projects/{beta_id}", headers=headers).json()
    response = client.put(f"/projects/{beta_id}", json={"status": "ACTIVE"}, headers=headers)
    assert response.status_code == 200
    assert datetime.fromisoformat(response.json()["updated_at"]) > datetime.fromisoformat(before["updated_at"])
    rows = audit_rows(db_session)
    assert [(row.entity_type, row.entity_id, row.action) for row in rows] == [("project", beta_id, "UPDATE")]
    assert rows[0].actor_email == "admin@acme.example"


def test_update_rechecks_dates_on_the_merged_values(
    client: TestClient, seeded: Seeded, db_session: Session
) -> None:
    """Alpha runs T-60 to T+25: an end before the stored start, or a start after the stored end, is 400."""
    alpha_id = seeded.project_ids["Alpha"]
    headers = seeded.headers["PM"]
    for body in ({"end_date": day(-61)}, {"start_date": day(26)}, {"start_date": day(5), "end_date": day(4)}):
        response = client.put(f"/projects/{alpha_id}", json=body, headers=headers)
        assert error_of(response) == (400, "VALIDATION_ERROR"), body
        assert fields_of(response) == ["end_date"]
    stored = client.get(f"/projects/{alpha_id}", headers=headers).json()
    assert (stored["start_date"], stored["end_date"]) == (day(-60), day(25))
    moved = client.put(f"/projects/{alpha_id}", json={"start_date": day(25)}, headers=headers)
    assert moved.status_code == 200 and moved.json()["start_date"] == day(25)
    assert [row.action for row in audit_rows(db_session)] == ["UPDATE"]


@pytest.mark.parametrize(
    ("body", "status", "error", "field"),
    [
        ({}, 400, "VALIDATION_ERROR", "request"),
        ({"project_name": None}, 400, "VALIDATION_ERROR", "project_name"),
        ({"status": None}, 400, "VALIDATION_ERROR", "status"),
        ({"department_id": None}, 400, "VALIDATION_ERROR", "department_id"),
        ({"start_date": None}, 400, "VALIDATION_ERROR", "start_date"),
        ({"planned_budget": None}, 400, "VALIDATION_ERROR", "planned_budget"),
        ({"planned_budget": "-1"}, 400, "VALIDATION_ERROR", "planned_budget"),
        ({"status": "ARCHIVED"}, 400, "VALIDATION_ERROR", "status"),
        ({"id": 5}, 400, "VALIDATION_ERROR", "id"),
        ({"department_id": 999999}, 400, "INVALID_REFERENCE", "department_id"),
        ({"project_manager_id": 999999}, 400, "INVALID_REFERENCE", "project_manager_id"),
    ],
)
def test_update_validates_the_body(
    client: TestClient, seeded: Seeded, body: dict[str, Any], status: int, error: str, field: str
) -> None:
    """Empty bodies, nulls for required fields, bad values and unknown references are refused."""
    response = client.put(f"/projects/{seeded.project_ids['Gamma']}", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (status, error)
    assert fields_of(response) == [field]


def test_update_missing_project_is_404(client: TestClient, seeded: Seeded) -> None:
    """PUT on an unknown id is 404, even with an otherwise valid body."""
    response = client.put("/projects/999999", json={"status": "ACTIVE"}, headers=seeded.headers["PM"])
    assert error_of(response) == (404, "NOT_FOUND")


# --- Delete -----------------------------------------------------------------------------------------


def test_delete_project_cascades_to_its_records(client: TestClient, seeded: Seeded, db_session: Session) -> None:
    """DELETE is 204 with no body; deliverables, edges, allocations and spend of the project go with it."""
    alpha_id = seeded.project_ids["Alpha"]
    headers = seeded.headers["PM"]
    assert count(db_session, Deliverable, Deliverable.project_id == alpha_id) == 6
    response = client.delete(f"/projects/{alpha_id}", headers=headers)
    assert response.status_code == 204 and response.content == b""
    assert error_of(client.get(f"/projects/{alpha_id}", headers=headers)) == (404, "NOT_FOUND")
    assert error_of(client.delete(f"/projects/{alpha_id}", headers=headers)) == (404, "NOT_FOUND")
    assert count(db_session, Deliverable, Deliverable.project_id == alpha_id) == 0
    assert count(db_session, ResourceAllocation, ResourceAllocation.project_id == alpha_id) == 0
    assert count(db_session, BudgetEntry, BudgetEntry.project_id == alpha_id) == 0
    # Alpha had 4 of the 14 seeded edges; the other projects keep their 10.
    assert count(db_session, DeliverableDependency) == 10
    remaining = list_projects(client, headers)
    assert list(by_name(remaining)) == ["Beta", "Gamma", "Delta", "Epsilon"]
    # With Alpha gone, Priya is no longer over-allocated, so Beta loses its resource points (31 - 8).
    assert by_name(remaining)["Beta"]["risk_score"] == 23


def test_delete_malformed_id_is_400(client: TestClient, seeded: Seeded) -> None:
    """A non-numeric id is a validation error, not a 404."""
    assert error_of(client.delete("/projects/abc", headers=seeded.headers["PM"])) == (400, "VALIDATION_ERROR")


# --- RBAC (spec section 7: projects are CRUD for ADMIN and PM, read-only for LEAD and VIEWER) -------


@pytest.mark.parametrize("role", ["ADMIN", "PM"])
def test_managers_have_full_crud_on_projects(client: TestClient, seeded: Seeded, role: str) -> None:
    """ADMIN and PM: list, read, create, update and delete are all allowed."""
    headers = seeded.headers[role]
    assert client.get("/projects", headers=headers).status_code == 200
    created = client.post("/projects", json=new_project_body(seeded.department_ids["Marketing"]), headers=headers)
    assert created.status_code == 201
    project_id = created.json()["id"]
    assert client.get(f"/projects/{project_id}", headers=headers).status_code == 200
    assert client.put(f"/projects/{project_id}", json={"status": "ACTIVE"}, headers=headers).status_code == 200
    assert client.delete(f"/projects/{project_id}", headers=headers).status_code == 204


@pytest.mark.parametrize("role", ["LEAD", "VIEWER"])
def test_lead_and_viewer_can_read_but_not_change_projects(
    client: TestClient, seeded: Seeded, db_session: Session, role: str
) -> None:
    """LEAD and VIEWER: reads are allowed; create, update and delete are 403 and change nothing."""
    headers = seeded.headers[role]
    alpha_id = seeded.project_ids["Alpha"]
    assert client.get("/projects", headers=headers).json()["total"] == 5
    assert client.get(f"/projects/{alpha_id}", headers=headers).status_code == 200
    for response in (
        client.post("/projects", json=new_project_body(seeded.department_ids["Marketing"]), headers=headers),
        client.put(f"/projects/{alpha_id}", json={"status": "CANCELLED"}, headers=headers),
        client.delete(f"/projects/{alpha_id}", headers=headers),
        # The role check comes before body validation: an invalid body is still a 403.
        client.post("/projects", json={}, headers=headers),
    ):
        assert error_of(response) == (403, "ACCESS_DENIED")
    assert client.get(f"/projects/{alpha_id}", headers=headers).json()["status"] == "ACTIVE"
    assert list_projects(client, headers)["total"] == 5
    assert audit_rows(db_session) == []


def test_projects_require_a_token(client: TestClient, seeded: Seeded) -> None:
    """Every project route is 401 UNAUTHENTICATED without a bearer token."""
    alpha_id = seeded.project_ids["Alpha"]
    for response in (
        client.get("/projects"),
        client.get(f"/projects/{alpha_id}"),
        client.post("/projects", json=new_project_body(seeded.department_ids["Marketing"])),
        client.put(f"/projects/{alpha_id}", json={"status": "ACTIVE"}),
        client.delete(f"/projects/{alpha_id}"),
    ):
        assert error_of(response) == (401, "UNAUTHENTICATED")
        assert response.headers["www-authenticate"] == "Bearer"


# --- Transactions and audit -------------------------------------------------------------------------


def test_each_project_mutation_writes_one_audit_row(client: TestClient, seeded: Seeded, db_session: Session) -> None:
    """Create, update and delete each write exactly one 'project' audit row in the same transaction."""
    headers = seeded.headers["PM"]
    pm_id = seeded.user_ids["pm@acme.example"]
    assert audit_rows(db_session) == []

    created = client.post("/projects", json=new_project_body(seeded.department_ids["Marketing"]), headers=headers)
    project_id = created.json()["id"]
    rows = audit_rows(db_session)
    assert len(rows) == 1
    row = rows[0]
    assert (row.entity_type, row.entity_id, row.action) == ("project", project_id, "CREATE")
    assert (row.actor_id, row.actor_email) == (pm_id, "pm@acme.example")
    assert row.before_state is None
    assert row.after_state["planned_budget"] == "250000.00" and row.after_state["status"] == "PLANNED"
    assert row.after_state["description"] == "Consolidate reporting data."

    client.put(f"/projects/{project_id}", json={"planned_budget": "300000.5"}, headers=headers)
    rows = audit_rows(db_session)
    assert len(rows) == 2
    row = rows[-1]
    assert (row.entity_type, row.entity_id, row.action) == ("project", project_id, "UPDATE")
    assert row.before_state["planned_budget"] == "250000.00"
    assert row.after_state["planned_budget"] == "300000.50"
    assert row.after_state["updated_at"] != row.before_state["updated_at"]

    client.delete(f"/projects/{project_id}", headers=headers)
    rows = audit_rows(db_session)
    assert len(rows) == 3
    row = rows[-1]
    assert (row.entity_type, row.entity_id, row.action) == ("project", project_id, "DELETE")
    assert row.after_state is None and row.before_state["id"] == project_id


def test_failed_project_mutations_write_no_audit_row(
    client: TestClient, seeded: Seeded, db_session: Session
) -> None:
    """Validation errors, bad references, missing records and denied roles leave the audit log empty."""
    pm, viewer = seeded.headers["PM"], seeded.headers["VIEWER"]
    gamma_id = seeded.project_ids["Gamma"]
    marketing = seeded.department_ids["Marketing"]
    responses = [
        client.post("/projects", json=new_project_body(marketing, end_date=day(-1)), headers=pm),
        client.post("/projects", json=new_project_body(999999), headers=pm),
        client.post("/projects", json=new_project_body(marketing, project_manager_id=999999), headers=pm),
        client.post("/projects", json=new_project_body(marketing), headers=viewer),
        client.put(f"/projects/{gamma_id}", json={"end_date": day(-41)}, headers=pm),
        client.put(f"/projects/{gamma_id}", json={"department_id": 999999}, headers=pm),
        client.put("/projects/999999", json={"status": "ACTIVE"}, headers=pm),
        client.delete("/projects/999999", headers=pm),
        client.delete(f"/projects/{gamma_id}", headers=viewer),
    ]
    assert [response.status_code for response in responses] == [400, 400, 400, 403, 400, 400, 404, 404, 403]
    assert audit_rows(db_session) == []
    assert list_projects(client, pm)["total"] == 5


@pytest.fixture
def broken_audit(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Make the audit write fail, to prove the change and the audit row commit together."""
    import app.services.projects as projects_service

    def explode(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("audit store unavailable")

    monkeypatch.setattr(projects_service, "record_audit", explode)
    yield


def test_a_failed_audit_write_rolls_the_change_back(
    client: TestClient, seeded: Seeded, db_session: Session, broken_audit: None
) -> None:
    """When the audit row cannot be written, the project change is rolled back (500, nothing stored)."""
    pm = seeded.headers["PM"]
    gamma_id = seeded.project_ids["Gamma"]
    created = client.post("/projects", json=new_project_body(seeded.department_ids["Marketing"]), headers=pm)
    assert error_of(created) == (500, "INTERNAL_ERROR")
    assert error_of(client.put(f"/projects/{gamma_id}", json={"status": "ON_HOLD"}, headers=pm)) == (
        500,
        "INTERNAL_ERROR",
    )
    assert error_of(client.delete(f"/projects/{gamma_id}", headers=pm)) == (500, "INTERNAL_ERROR")
    assert count(db_session, Project) == 5
    assert count(db_session, Project, Project.status == "ON_HOLD") == 0
