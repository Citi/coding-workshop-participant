"""Budget entries API: CRUD, filters, money validation, derived spend, RBAC and audit (spec 6, 7, 8, 13.1)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AuditLog, BudgetEntry, Project, User
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

ENTRY_KEYS = {"id", "project_id", "project_name", "category", "description", "amount", "entry_date", "created_at"}


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
    entry_ids: dict[tuple[str, str], int]
    headers: dict[str, dict[str, str]]


@pytest.fixture
def seeded(db_session: Session) -> Seeded:
    """Seed the spec section 10 portfolio at the fixed date ``T`` and commit it."""
    seed_portfolio(db_session, TEST_PASSWORD, today=T)
    db_session.commit()
    users = {user.email: user for user in db_session.scalars(select(User))}
    return Seeded(
        project_ids={short_name(p.project_name): p.id for p in db_session.scalars(select(Project))},
        entry_ids={
            (short_name(entry.project.project_name), entry.category): entry.id
            for entry in db_session.scalars(select(BudgetEntry))
        },
        headers={role: headers_for(users[email]) for role, email in ROLE_EMAILS.items()},
    )


def audit_rows(db: Session) -> list[AuditLog]:
    """Every audit row, oldest first, read fresh from the database."""
    db.expire_all()
    return list(db.scalars(select(AuditLog).order_by(AuditLog.id)))


def entry_count(db: Session) -> int:
    """Number of budget entries in the database."""
    db.expire_all()
    return db.scalar(select(func.count()).select_from(BudgetEntry)) or 0


def new_entry(project_id: int, /, **overrides: Any) -> dict[str, Any]:
    """A valid POST /budget-entries body: 1,500.50 of SOFTWARE on T-1; overrides may replace any field."""
    return {
        "project_id": project_id,
        "category": "SOFTWARE",
        "description": "  Load-testing licences  ",
        "amount": "1500.5",
        "entry_date": day(-1),
        **overrides,
    }


def spend_of(client: TestClient, seeded: Seeded, project: str) -> tuple[str, str, float | None]:
    """A project's (actual_spend, remaining_budget, utilization_pct) as of T."""
    body = client.get(
        f"/projects/{seeded.project_ids[project]}", params={"as_of": T.isoformat()}, headers=seeded.headers["VIEWER"]
    ).json()
    return body["actual_spend"], body["remaining_budget"], body["utilization_pct"]


# --- Reads ------------------------------------------------------------------------------------------


def test_list_budget_entries_with_filters_and_paging(client: TestClient, seeded: Seeded) -> None:
    """Lists are {items, total} ordered by id; project_id and category filter and combine; money is a string."""
    headers = seeded.headers["VIEWER"]
    everything = client.get("/budget-entries", headers=headers).json()
    assert everything["total"] == 16
    assert all(set(item) == ENTRY_KEYS for item in everything["items"])
    assert [item["id"] for item in everything["items"]] == sorted(seeded.entry_ids.values())

    alpha = client.get("/budget-entries", params={"project_id": seeded.project_ids["Alpha"]}, headers=headers).json()
    assert alpha["total"] == 5
    assert [item["amount"] for item in alpha["items"]] == ["180000.00", "60000.00", "35000.00", "20000.00", "5000.00"]
    assert {item["project_name"] for item in alpha["items"]} == {"Project Alpha: Customer Payments Platform"}

    labor = client.get("/budget-entries", params={"category": "LABOR"}, headers=headers).json()
    assert labor["total"] == 5 and {item["category"] for item in labor["items"]} == {"LABOR"}
    both = client.get(
        "/budget-entries", params={"category": "LABOR", "project_id": seeded.project_ids["Alpha"]}, headers=headers
    ).json()
    assert both["total"] == 1 and both["items"][0]["amount"] == "180000.00"
    assert both["items"][0]["description"] == "Engineering contractors"
    assert both["items"][0]["entry_date"] == day(-20)
    travel = client.get("/budget-entries", params={"category": "TRAVEL"}, headers=headers).json()
    assert [(short_name(item["project_name"]), item["amount"]) for item in travel["items"]] == [("Alpha", "5000.00")]

    page = client.get("/budget-entries", params={"limit": 5, "offset": 15}, headers=headers).json()
    assert len(page["items"]) == 1 and page["total"] == 16
    nothing = client.get(
        "/budget-entries", params={"category": "TRAVEL", "project_id": seeded.project_ids["Beta"]}, headers=headers
    )
    assert nothing.json() == {"items": [], "total": 0}


@pytest.mark.parametrize(
    "params", [{"category": "FOOD"}, {"category": "labor"}, {"project_id": 0}, {"project_id": "x"}, {"limit": 0}]
)
def test_list_rejects_bad_query_parameters(client: TestClient, seeded: Seeded, params: dict[str, Any]) -> None:
    """Bad filters and paging are 400 VALIDATION_ERROR naming the parameter."""
    response = client.get("/budget-entries", params=params, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == list(params)


def test_get_one_budget_entry(client: TestClient, seeded: Seeded) -> None:
    """One entry with its project's name; unknown ids are 404 and malformed ids 400."""
    entry_id = seeded.entry_ids[("Gamma", "OTHER")]
    response = client.get(f"/budget-entries/{entry_id}", headers=seeded.headers["LEAD"])
    assert response.status_code == 200
    body = response.json()
    assert set(body) == ENTRY_KEYS
    assert (body["category"], body["amount"], body["description"]) == ("OTHER", "7500.00", "Audit advisory fees")
    assert body["project_name"] == "Project Gamma: Ledger Automation"
    assert error_of(client.get("/budget-entries/999999", headers=seeded.headers["LEAD"])) == (404, "NOT_FOUND")
    assert error_of(client.get("/budget-entries/-1", headers=seeded.headers["LEAD"])) == (400, "VALIDATION_ERROR")


# --- Create -----------------------------------------------------------------------------------------


def test_create_budget_entry(client: TestClient, seeded: Seeded) -> None:
    """POST is 201; the amount comes back with two decimals and the description trimmed."""
    response = client.post("/budget-entries", json=new_entry(seeded.project_ids["Beta"]), headers=seeded.headers["PM"])
    assert response.status_code == 201, response.text
    created = response.json()
    assert set(created) == ENTRY_KEYS
    assert (created["amount"], created["category"], created["entry_date"]) == ("1500.50", "SOFTWARE", day(-1))
    assert created["description"] == "Load-testing licences"
    assert created["project_name"] == "Project Beta: Brand Relaunch Campaign"
    fetched = client.get(f"/budget-entries/{created['id']}", headers=seeded.headers["VIEWER"])
    assert fetched.status_code == 200 and fetched.json() == created


@pytest.mark.parametrize(
    ("amount", "stored"),
    [(2500, "2500.00"), (0.01, "0.01"), ("1.100", "1.10"), ("1e3", "1000.00"), ("999999999999.99", "999999999999.99")],
)
def test_create_normalises_valid_amounts(client: TestClient, seeded: Seeded, amount: Any, stored: str) -> None:
    """Numbers and decimal strings with at most 12 integer digits and 2 decimals are stored as cents."""
    body = new_entry(seeded.project_ids["Gamma"], amount=amount, description="   ")
    response = client.post("/budget-entries", json=body, headers=seeded.headers["ADMIN"])
    assert response.status_code == 201, response.text
    assert response.json()["amount"] == stored and response.json()["description"] is None


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"amount": 0}, "amount"),
        ({"amount": "0.00"}, "amount"),
        ({"amount": "-5"}, "amount"),
        ({"amount": "0.001"}, "amount"),
        ({"amount": "1000000000000.00"}, "amount"),
        ({"amount": "NaN"}, "amount"),
        ({"amount": "-Infinity"}, "amount"),
        ({"amount": True}, "amount"),
        ({"amount": "ten"}, "amount"),
        ({"amount": None}, "amount"),
        ({"category": "FOOD"}, "category"),
        ({"category": None}, "category"),
        ({"description": "x" * 301}, "description"),
        ({"description": "two\nlines"}, "description"),
        ({"description": "nul\x00"}, "description"),
        ({"entry_date": "2026-02-30"}, "entry_date"),
        ({"entry_date": None}, "entry_date"),
        ({"project_id": 0}, "project_id"),
        ({"project_id": True}, "project_id"),
        ({"currency": "EUR"}, "currency"),
    ],
)
def test_create_validates_the_body(
    client: TestClient, seeded: Seeded, db_session: Session, overrides: dict[str, Any], field: str
) -> None:
    """Bad amounts, categories, descriptions, dates and unknown fields are 400 VALIDATION_ERROR naming the field."""
    response = client.post(
        "/budget-entries", json=new_entry(seeded.project_ids["Beta"], **overrides), headers=seeded.headers["PM"]
    )
    assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == [field]
    assert entry_count(db_session) == 16


@pytest.mark.parametrize("missing", ["project_id", "category", "amount", "entry_date"])
def test_create_requires_its_fields(client: TestClient, seeded: Seeded, missing: str) -> None:
    """Everything except the description is required."""
    body = new_entry(seeded.project_ids["Beta"])
    del body[missing]
    response = client.post("/budget-entries", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == [missing]


def test_create_rejects_an_unknown_project(client: TestClient, seeded: Seeded) -> None:
    """A project that does not exist is 400 INVALID_REFERENCE on project_id."""
    response = client.post("/budget-entries", json=new_entry(999999), headers=seeded.headers["PM"])
    assert error_of(response) == (400, "INVALID_REFERENCE") and fields_of(response) == ["project_id"]


# --- Spend is derived from the entries (spec section 2: no stored actual spend) ---------------------


def test_project_spend_follows_its_budget_entries(client: TestClient, seeded: Seeded) -> None:
    """Creating, changing, moving and deleting an entry changes the projects' actual spend on the next read."""
    headers = seeded.headers["PM"]
    assert spend_of(client, seeded, "Alpha") == ("300000.00", "100000.00", 75.0)
    created = client.post(
        "/budget-entries", json=new_entry(seeded.project_ids["Alpha"], amount="100000"), headers=headers
    ).json()
    assert spend_of(client, seeded, "Alpha") == ("400000.00", "0.00", 100.0)
    client.put(f"/budget-entries/{created['id']}", json={"amount": "120000.00"}, headers=headers)
    assert spend_of(client, seeded, "Alpha") == ("420000.00", "-20000.00", 105.0)
    moved = client.put(
        f"/budget-entries/{created['id']}", json={"project_id": seeded.project_ids["Beta"]}, headers=headers
    )
    assert moved.json()["project_name"] == "Project Beta: Brand Relaunch Campaign"
    assert spend_of(client, seeded, "Alpha") == ("300000.00", "100000.00", 75.0)
    assert spend_of(client, seeded, "Beta") == ("225000.00", "-75000.00", 150.0)
    assert client.delete(f"/budget-entries/{created['id']}", headers=headers).status_code == 204
    assert spend_of(client, seeded, "Beta") == ("105000.00", "45000.00", 70.0)


# --- Update -----------------------------------------------------------------------------------------


def test_update_budget_entry_fields(client: TestClient, seeded: Seeded) -> None:
    """PUT changes only the fields sent; description can be cleared with null."""
    entry_id = seeded.entry_ids[("Delta", "VENDOR")]
    headers = seeded.headers["ADMIN"]
    before = client.get(f"/budget-entries/{entry_id}", headers=headers).json()
    response = client.put(
        f"/budget-entries/{entry_id}",
        json={"category": "OTHER", "description": None, "entry_date": day(-3), "amount": 31000},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert (updated["category"], updated["description"], updated["entry_date"], updated["amount"]) == (
        "OTHER",
        None,
        day(-3),
        "31000.00",
    )
    assert (updated["project_id"], updated["created_at"]) == (before["project_id"], before["created_at"])


@pytest.mark.parametrize(
    ("body", "status", "error", "field"),
    [
        ({}, 400, "VALIDATION_ERROR", "request"),
        ({"project_id": None}, 400, "VALIDATION_ERROR", "project_id"),
        ({"category": None}, 400, "VALIDATION_ERROR", "category"),
        ({"amount": None}, 400, "VALIDATION_ERROR", "amount"),
        ({"entry_date": None}, 400, "VALIDATION_ERROR", "entry_date"),
        ({"amount": "-1"}, 400, "VALIDATION_ERROR", "amount"),
        ({"category": "BRIBES"}, 400, "VALIDATION_ERROR", "category"),
        ({"project_name": "X"}, 400, "VALIDATION_ERROR", "project_name"),
        ({"project_id": 999999}, 400, "INVALID_REFERENCE", "project_id"),
    ],
)
def test_update_validates_the_body(
    client: TestClient, seeded: Seeded, body: dict[str, Any], status: int, error: str, field: str
) -> None:
    """Empty bodies, nulls for required fields, bad values and unknown projects are refused."""
    entry_id = seeded.entry_ids[("Delta", "VENDOR")]
    response = client.put(f"/budget-entries/{entry_id}", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (status, error) and fields_of(response) == [field]
    assert client.get(f"/budget-entries/{entry_id}", headers=seeded.headers["PM"]).json()["amount"] == "30000.00"


def test_update_missing_budget_entry_is_404(client: TestClient, seeded: Seeded) -> None:
    """PUT on an unknown id is 404."""
    response = client.put("/budget-entries/999999", json={"amount": "10"}, headers=seeded.headers["PM"])
    assert error_of(response) == (404, "NOT_FOUND")


# --- Delete -----------------------------------------------------------------------------------------


def test_delete_budget_entry(client: TestClient, seeded: Seeded, db_session: Session) -> None:
    """DELETE is 204 with no body; the entry is gone afterwards."""
    entry_id = seeded.entry_ids[("Epsilon", "SOFTWARE")]
    headers = seeded.headers["PM"]
    response = client.delete(f"/budget-entries/{entry_id}", headers=headers)
    assert response.status_code == 204 and response.content == b""
    assert error_of(client.get(f"/budget-entries/{entry_id}", headers=headers)) == (404, "NOT_FOUND")
    assert error_of(client.delete(f"/budget-entries/{entry_id}", headers=headers)) == (404, "NOT_FOUND")
    assert entry_count(db_session) == 15


# --- RBAC (spec section 7: budget entries are CRUD for ADMIN and PM, read-only for LEAD and VIEWER) -


@pytest.mark.parametrize("role", ["ADMIN", "PM"])
def test_managers_have_full_crud_on_budget_entries(client: TestClient, seeded: Seeded, role: str) -> None:
    """ADMIN and PM: list, read, create, update and delete are all allowed."""
    headers = seeded.headers[role]
    assert client.get("/budget-entries", headers=headers).status_code == 200
    created = client.post("/budget-entries", json=new_entry(seeded.project_ids["Delta"]), headers=headers)
    assert created.status_code == 201
    entry_id = created.json()["id"]
    assert client.get(f"/budget-entries/{entry_id}", headers=headers).status_code == 200
    assert client.put(f"/budget-entries/{entry_id}", json={"amount": "99.99"}, headers=headers).status_code == 200
    assert client.delete(f"/budget-entries/{entry_id}", headers=headers).status_code == 204


@pytest.mark.parametrize("role", ["LEAD", "VIEWER"])
def test_lead_and_viewer_can_read_but_not_change_budget_entries(
    client: TestClient, seeded: Seeded, db_session: Session, role: str
) -> None:
    """LEAD and VIEWER: reads are allowed; create, update and delete are 403 and change nothing."""
    headers = seeded.headers[role]
    entry_id = seeded.entry_ids[("Alpha", "LABOR")]
    assert client.get("/budget-entries", headers=headers).json()["total"] == 16
    assert client.get(f"/budget-entries/{entry_id}", headers=headers).status_code == 200
    for response in (
        client.post("/budget-entries", json=new_entry(seeded.project_ids["Delta"]), headers=headers),
        client.put(f"/budget-entries/{entry_id}", json={"amount": "1.00"}, headers=headers),
        client.delete(f"/budget-entries/{entry_id}", headers=headers),
    ):
        assert error_of(response) == (403, "ACCESS_DENIED")
    assert client.get(f"/budget-entries/{entry_id}", headers=headers).json()["amount"] == "180000.00"
    assert entry_count(db_session) == 16
    assert audit_rows(db_session) == []


def test_budget_entries_require_a_token(client: TestClient, seeded: Seeded) -> None:
    """Every budget entry route is 401 UNAUTHENTICATED without a bearer token."""
    entry_id = seeded.entry_ids[("Alpha", "LABOR")]
    for response in (
        client.get("/budget-entries"),
        client.get(f"/budget-entries/{entry_id}"),
        client.post("/budget-entries", json=new_entry(seeded.project_ids["Delta"])),
        client.put(f"/budget-entries/{entry_id}", json={"amount": "1.00"}),
        client.delete(f"/budget-entries/{entry_id}"),
    ):
        assert error_of(response) == (401, "UNAUTHENTICATED")


# --- Transactions and audit -------------------------------------------------------------------------


def test_each_budget_entry_mutation_writes_one_audit_row(
    client: TestClient, seeded: Seeded, db_session: Session
) -> None:
    """Create, update and delete each write exactly one 'budget_entry' audit row with money as strings."""
    headers = seeded.headers["PM"]
    entry_id = client.post("/budget-entries", json=new_entry(seeded.project_ids["Delta"]), headers=headers).json()["id"]
    rows = audit_rows(db_session)
    assert [(row.entity_type, row.entity_id, row.action) for row in rows] == [("budget_entry", entry_id, "CREATE")]
    assert rows[0].actor_email == "pm@acme.example" and rows[0].before_state is None
    assert rows[0].after_state["amount"] == "1500.50" and rows[0].after_state["category"] == "SOFTWARE"

    client.put(f"/budget-entries/{entry_id}", json={"amount": "2000"}, headers=headers)
    rows = audit_rows(db_session)
    assert len(rows) == 2 and (rows[-1].entity_id, rows[-1].action) == (entry_id, "UPDATE")
    assert (rows[-1].before_state["amount"], rows[-1].after_state["amount"]) == ("1500.50", "2000.00")

    client.delete(f"/budget-entries/{entry_id}", headers=headers)
    rows = audit_rows(db_session)
    assert len(rows) == 3 and (rows[-1].entity_id, rows[-1].action) == (entry_id, "DELETE")
    assert rows[-1].after_state is None and rows[-1].before_state["amount"] == "2000.00"


def test_failed_budget_entry_mutations_write_no_audit_row(
    client: TestClient, seeded: Seeded, db_session: Session
) -> None:
    """Validation errors, bad references, missing records and denied roles leave no audit row and no change."""
    pm, viewer = seeded.headers["PM"], seeded.headers["VIEWER"]
    entry_id = seeded.entry_ids[("Beta", "VENDOR")]
    responses = [
        client.post("/budget-entries", json=new_entry(seeded.project_ids["Beta"], amount="0"), headers=pm),
        client.post("/budget-entries", json=new_entry(999999), headers=pm),
        client.post("/budget-entries", json=new_entry(seeded.project_ids["Beta"]), headers=viewer),
        client.put(f"/budget-entries/{entry_id}", json={"project_id": 999999}, headers=pm),
        client.put("/budget-entries/999999", json={"amount": "5"}, headers=pm),
        client.delete("/budget-entries/999999", headers=pm),
        client.delete(f"/budget-entries/{entry_id}", headers=viewer),
    ]
    assert [response.status_code for response in responses] == [400, 400, 403, 400, 404, 404, 403]
    assert audit_rows(db_session) == []
    assert entry_count(db_session) == 16
