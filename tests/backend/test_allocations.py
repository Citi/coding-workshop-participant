"""Allocations API: CRUD, filters, validation, the capacity warning, RBAC and audit (spec 6, 7, 8, 13.1)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AuditLog, Deliverable, Project, ResourceAllocation, User
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

ALLOCATION_KEYS = {
    "id",
    "user_id",
    "user_name",
    "project_id",
    "project_name",
    "deliverable_id",
    "deliverable_title",
    "allocation_percentage",
    "start_date",
    "end_date",
    "created_at",
}
WRITE_KEYS = ALLOCATION_KEYS | {"capacity_warning"}


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
    person_ids: dict[str, int]
    deliverable_ids: dict[str, int]
    allocation_ids: dict[tuple[str, str], int]
    headers: dict[str, dict[str, str]]

    def person(self, first_name: str) -> int:
        """User id of a seeded person by first name, such as 'Priya' or 'Rohan'."""
        return self.person_ids[first_name]


@pytest.fixture
def seeded(db_session: Session) -> Seeded:
    """Seed the spec section 10 portfolio at the fixed date ``T`` and commit it."""
    seed_portfolio(db_session, TEST_PASSWORD, today=T)
    db_session.commit()
    users = {user.email: user for user in db_session.scalars(select(User))}
    allocations = {
        (allocation.user.name.split()[0], short_name(allocation.project.project_name)): allocation.id
        for allocation in db_session.scalars(select(ResourceAllocation))
    }
    return Seeded(
        project_ids={short_name(p.project_name): p.id for p in db_session.scalars(select(Project))},
        user_ids={email: user.id for email, user in users.items()},
        person_ids={user.name.split()[0]: user.id for user in users.values()},
        deliverable_ids={d.title: d.id for d in db_session.scalars(select(Deliverable))},
        allocation_ids=allocations,
        headers={role: headers_for(users[email]) for role, email in ROLE_EMAILS.items()},
    )


def audit_rows(db: Session) -> list[AuditLog]:
    """Every audit row, oldest first, read fresh from the database."""
    db.expire_all()
    return list(db.scalars(select(AuditLog).order_by(AuditLog.id)))


def allocation_count(db: Session) -> int:
    """Number of allocations in the database."""
    db.expire_all()
    return db.scalar(select(func.count()).select_from(ResourceAllocation)) or 0


def body_for(seeded: Seeded, person: str, project: str, percentage: int, start: int, end: int, **extra: Any) -> dict:
    """A POST /allocations body for a seeded person and project, with dates as offsets from T."""
    return {
        "user_id": seeded.person(person),
        "project_id": seeded.project_ids[project],
        "allocation_percentage": percentage,
        "start_date": day(start),
        "end_date": day(end),
        **extra,
    }


# --- Reads ------------------------------------------------------------------------------------------


def test_list_allocations_with_filters_and_paging(client: TestClient, seeded: Seeded) -> None:
    """Lists are {items, total} ordered by id; user_id and project_id filter and combine."""
    headers = seeded.headers["VIEWER"]
    everything = client.get("/allocations", headers=headers).json()
    assert everything["total"] == 8
    assert [item["id"] for item in everything["items"]] == sorted(seeded.allocation_ids.values())
    assert all(set(item) == ALLOCATION_KEYS for item in everything["items"])

    priya = client.get("/allocations", params={"user_id": seeded.person("Priya")}, headers=headers).json()
    assert [short_name(item["project_name"]) for item in priya["items"]] == ["Alpha", "Beta", "Gamma"]
    assert priya["total"] == 3 and {item["user_name"] for item in priya["items"]} == {"Priya Nair"}

    alpha = client.get("/allocations", params={"project_id": seeded.project_ids["Alpha"]}, headers=headers).json()
    assert [item["user_name"] for item in alpha["items"]] == ["Priya Nair", "Arjun Mehta", "Rohan Das"]

    both = client.get(
        "/allocations",
        params={"user_id": seeded.person("Priya"), "project_id": seeded.project_ids["Alpha"]},
        headers=headers,
    ).json()
    assert both["total"] == 1
    item = both["items"][0]
    assert (item["deliverable_id"], item["deliverable_title"]) == (seeded.deliverable_ids["API Schema"], "API Schema")
    assert (item["allocation_percentage"], item["start_date"], item["end_date"]) == (60, day(-10), day(20))

    page = client.get("/allocations", params={"limit": 3, "offset": 6}, headers=headers).json()
    assert len(page["items"]) == 2 and page["total"] == 8
    nobody = client.get("/allocations", params={"user_id": seeded.user_ids["admin@acme.example"]}, headers=headers)
    assert nobody.json() == {"items": [], "total": 0}


@pytest.mark.parametrize("params", [{"user_id": 0}, {"project_id": "abc"}, {"limit": 500}, {"offset": -1}])
def test_list_rejects_bad_query_parameters(client: TestClient, seeded: Seeded, params: dict[str, Any]) -> None:
    """Bad filters and paging are 400 VALIDATION_ERROR naming the parameter."""
    response = client.get("/allocations", params=params, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == list(params)


def test_get_one_allocation(client: TestClient, seeded: Seeded) -> None:
    """A project-level allocation has no deliverable; unknown ids are 404 and malformed ids 400."""
    allocation_id = seeded.allocation_ids[("Priya", "Beta")]
    response = client.get(f"/allocations/{allocation_id}", headers=seeded.headers["LEAD"])
    assert response.status_code == 200
    body = response.json()
    assert set(body) == ALLOCATION_KEYS
    assert (body["user_name"], body["project_name"]) == ("Priya Nair", "Project Beta: Brand Relaunch Campaign")
    assert body["deliverable_id"] is None and body["deliverable_title"] is None
    assert (body["allocation_percentage"], body["start_date"], body["end_date"]) == (60, day(-2), day(12))
    assert error_of(client.get("/allocations/999999", headers=seeded.headers["LEAD"])) == (404, "NOT_FOUND")
    assert error_of(client.get("/allocations/0", headers=seeded.headers["LEAD"])) == (400, "VALIDATION_ERROR")


# --- Capacity warning (spec section 8: always allowed, but surfaced) --------------------------------


def test_an_allocation_pushing_priya_above_100_returns_the_window_and_load(
    client: TestClient, seeded: Seeded
) -> None:
    """Priya is at 60% from T+13 to T+20; another 50% from T+13 to T+15 is saved with a 110% warning."""
    body = body_for(seeded, "Priya", "Gamma", 50, 13, 15)
    response = client.post("/allocations", json=body, headers=seeded.headers["PM"])
    assert response.status_code == 201, response.text
    created = response.json()
    assert set(created) == WRITE_KEYS
    assert created["capacity_warning"] == {
        "user_id": seeded.person("Priya"),
        "user_name": "Priya Nair",
        "peak_load": 110,
        "windows": [{"start_date": day(13), "end_date": day(15), "load": 110}],
        "message": f"Saved, but Priya Nair is now allocated above 100%: 110% from {day(13)} to {day(15)}.",
    }
    stored = client.get(f"/allocations/{created['id']}", headers=seeded.headers["PM"])
    assert stored.status_code == 200 and set(stored.json()) == ALLOCATION_KEYS


def test_the_warning_lists_only_windows_that_include_the_allocation(client: TestClient, seeded: Seeded) -> None:
    """A 10% allocation for T and T+1 lifts Priya's existing 120% to 130% there; her other 120% days are not listed."""
    body = body_for(seeded, "Priya", "Gamma", 10, 0, 1)
    response = client.post("/allocations", json=body, headers=seeded.headers["PM"])
    assert response.status_code == 201
    warning = response.json()["capacity_warning"]
    assert warning["windows"] == [{"start_date": day(0), "end_date": day(1), "load": 130}]
    assert warning["peak_load"] == 130


def test_the_warning_reports_every_window_and_the_peak(client: TestClient, seeded: Seeded) -> None:
    """50% from T+10 to T+14 overlaps two segments: 170% (with Beta) to T+12, then 110% to T+14."""
    body = body_for(seeded, "Priya", "Gamma", 50, 10, 14)
    response = client.post("/allocations", json=body, headers=seeded.headers["ADMIN"])
    assert response.status_code == 201
    warning = response.json()["capacity_warning"]
    assert warning["windows"] == [
        {"start_date": day(10), "end_date": day(12), "load": 170},
        {"start_date": day(13), "end_date": day(14), "load": 110},
    ]
    assert warning["peak_load"] == 170
    assert warning["message"] == (
        f"Saved, but Priya Nair is now allocated above 100%: 170% from {day(10)} to {day(12)} "
        f"and 110% from {day(13)} to {day(14)}."
    )


@pytest.mark.parametrize(
    ("person", "percentage", "start", "end"),
    [
        ("Priya", 30, 80, 90),  # after all of her allocations
        ("Priya", 100, 21, 39),  # in the gap between Alpha (ends T+20) and Gamma (starts T+40)
        ("Priya", 40, 13, 20),  # exactly 100% with Alpha: full, not over
        ("Arjun", 40, 0, 5),  # exactly 100% with his Alpha allocation
    ],
)
def test_no_warning_when_the_person_stays_at_or_below_100(
    client: TestClient, seeded: Seeded, person: str, percentage: int, start: int, end: int
) -> None:
    """capacity_warning is null when no window that includes the allocation goes above 100%."""
    response = client.post(
        "/allocations", json=body_for(seeded, person, "Gamma", percentage, start, end), headers=seeded.headers["PM"]
    )
    assert response.status_code == 201, response.text
    assert response.json()["capacity_warning"] is None


def test_an_update_can_raise_and_clear_the_warning(client: TestClient, seeded: Seeded) -> None:
    """Moving Priya's Gamma allocation into her busy weeks warns; moving it back or lowering a load clears it."""
    gamma_id = seeded.allocation_ids[("Priya", "Gamma")]
    headers = seeded.headers["PM"]
    moved = client.put(f"/allocations/{gamma_id}", json={"start_date": day(5), "end_date": day(8)}, headers=headers)
    assert moved.status_code == 200, moved.text
    assert set(moved.json()) == WRITE_KEYS
    assert moved.json()["capacity_warning"]["windows"] == [{"start_date": day(5), "end_date": day(8), "load": 170}]
    back = client.put(f"/allocations/{gamma_id}", json={"start_date": day(40), "end_date": day(70)}, headers=headers)
    assert back.status_code == 200 and back.json()["capacity_warning"] is None
    # Priya's seeded conflict is Alpha 60% + Beta 60%; at 40% on Alpha she peaks at exactly 100%.
    lowered = client.put(
        f"/allocations/{seeded.allocation_ids[('Priya', 'Alpha')]}", json={"allocation_percentage": 40}, headers=headers
    )
    assert lowered.status_code == 200 and lowered.json()["capacity_warning"] is None
    assert lowered.json()["allocation_percentage"] == 40


def test_an_update_of_an_already_conflicting_allocation_keeps_warning(client: TestClient, seeded: Seeded) -> None:
    """Saving Priya's Beta allocation unchanged still reports the 120% window it is part of."""
    beta_id = seeded.allocation_ids[("Priya", "Beta")]
    response = client.put(f"/allocations/{beta_id}", json={"allocation_percentage": 60}, headers=seeded.headers["PM"])
    assert response.status_code == 200
    assert response.json()["capacity_warning"]["windows"] == [
        {"start_date": day(-2), "end_date": day(12), "load": 120}
    ]


# --- Create validation ------------------------------------------------------------------------------


def test_create_a_deliverable_level_allocation(client: TestClient, seeded: Seeded) -> None:
    """A deliverable of the allocation's own project is accepted and named in the response."""
    body = body_for(seeded, "Rohan", "Alpha", 10, 30, 40, deliverable_id=seeded.deliverable_ids["End-to-End Testing"])
    response = client.post("/allocations", json=body, headers=seeded.headers["PM"])
    assert response.status_code == 201, response.text
    created = response.json()
    assert (created["deliverable_title"], created["user_name"], created["project_name"]) == (
        "End-to-End Testing",
        "Rohan Das",
        "Project Alpha: Customer Payments Platform",
    )
    assert (created["start_date"], created["end_date"], created["allocation_percentage"]) == (day(30), day(40), 10)


@pytest.mark.parametrize("field", ["user_id", "project_id", "deliverable_id"])
def test_create_rejects_unknown_references(client: TestClient, seeded: Seeded, field: str) -> None:
    """An unknown person, project or deliverable is 400 INVALID_REFERENCE naming the field."""
    body = body_for(seeded, "Priya", "Gamma", 10, 80, 90)
    body[field] = 999999
    response = client.post("/allocations", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "INVALID_REFERENCE") and fields_of(response) == [field]


def test_create_rejects_a_deliverable_of_another_project(client: TestClient, seeded: Seeded) -> None:
    """The deliverable must belong to the allocation's project: 400 VALIDATION_ERROR on deliverable_id."""
    other_projects_deliverable = seeded.deliverable_ids["Bank Feed Integration"]
    body = body_for(seeded, "Arjun", "Alpha", 10, 80, 90, deliverable_id=other_projects_deliverable)
    response = client.post("/allocations", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == ["deliverable_id"]


def test_create_rejects_an_end_date_before_the_start(client: TestClient, seeded: Seeded) -> None:
    """end_date before start_date is 400 VALIDATION_ERROR on end_date; one day (start == end) is fine."""
    headers = seeded.headers["PM"]
    response = client.post("/allocations", json=body_for(seeded, "Priya", "Gamma", 10, 81, 80), headers=headers)
    assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == ["end_date"]
    single_day = client.post("/allocations", json=body_for(seeded, "Priya", "Gamma", 10, 80, 80), headers=headers)
    assert single_day.status_code == 201


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"allocation_percentage": 0}, "allocation_percentage"),
        ({"allocation_percentage": 101}, "allocation_percentage"),
        ({"allocation_percentage": 50.5}, "allocation_percentage"),
        ({"allocation_percentage": True}, "allocation_percentage"),
        ({"allocation_percentage": "half"}, "allocation_percentage"),
        ({"allocation_percentage": None}, "allocation_percentage"),
        ({"user_id": 0}, "user_id"),
        ({"user_id": None}, "user_id"),
        ({"project_id": False}, "project_id"),
        ({"deliverable_id": -1}, "deliverable_id"),
        ({"start_date": "2026-02-30"}, "start_date"),
        ({"end_date": None}, "end_date"),
        ({"capacity_warning": None}, "capacity_warning"),
    ],
)
def test_create_validates_the_body(client: TestClient, seeded: Seeded, overrides: dict[str, Any], field: str) -> None:
    """Bad values and unknown fields are 400 VALIDATION_ERROR naming the field; nothing is saved."""
    body = {**body_for(seeded, "Priya", "Gamma", 10, 80, 90), **overrides}
    response = client.post("/allocations", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == [field]


@pytest.mark.parametrize("missing", ["user_id", "project_id", "allocation_percentage", "start_date", "end_date"])
def test_create_requires_its_fields(client: TestClient, seeded: Seeded, missing: str, db_session: Session) -> None:
    """Every field except deliverable_id is required."""
    body = body_for(seeded, "Priya", "Gamma", 10, 80, 90)
    del body[missing]
    response = client.post("/allocations", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == [missing]
    assert allocation_count(db_session) == 8


# --- Update -----------------------------------------------------------------------------------------


def test_update_rechecks_the_merged_values(client: TestClient, seeded: Seeded) -> None:
    """Priya's Alpha allocation is on 'API Schema': moving it to Beta needs the deliverable cleared too."""
    allocation_id = seeded.allocation_ids[("Priya", "Alpha")]
    headers = seeded.headers["PM"]
    beta_id = seeded.project_ids["Beta"]
    moved = client.put(f"/allocations/{allocation_id}", json={"project_id": beta_id}, headers=headers)
    assert error_of(moved) == (400, "VALIDATION_ERROR") and fields_of(moved) == ["deliverable_id"]
    for body in ({"end_date": day(-11)}, {"start_date": day(21)}):
        response = client.put(f"/allocations/{allocation_id}", json=body, headers=headers)
        assert error_of(response) == (400, "VALIDATION_ERROR") and fields_of(response) == ["end_date"]
    unchanged = client.get(f"/allocations/{allocation_id}", headers=headers).json()
    assert (unchanged["project_id"], unchanged["deliverable_title"]) == (seeded.project_ids["Alpha"], "API Schema")
    assert (unchanged["start_date"], unchanged["end_date"]) == (day(-10), day(20))

    response = client.put(
        f"/allocations/{allocation_id}", json={"project_id": beta_id, "deliverable_id": None}, headers=headers
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert (updated["project_name"], updated["deliverable_id"], updated["deliverable_title"]) == (
        "Project Beta: Brand Relaunch Campaign",
        None,
        None,
    )
    relinked = client.put(
        f"/allocations/{allocation_id}",
        json={
            "project_id": seeded.project_ids["Alpha"],
            "deliverable_id": seeded.deliverable_ids["Payments Service Integration"],
        },
        headers=headers,
    )
    assert relinked.status_code == 200 and relinked.json()["deliverable_title"] == "Payments Service Integration"
    other_person = client.put(
        f"/allocations/{allocation_id}", json={"user_id": seeded.person("Arjun")}, headers=headers
    )
    assert other_person.status_code == 200 and other_person.json()["user_name"] == "Arjun Mehta"
    # Arjun now holds 60% (Alpha) + 60% (this one) from T-10 to T+9.
    assert other_person.json()["capacity_warning"]["user_name"] == "Arjun Mehta"


@pytest.mark.parametrize(
    ("body", "status", "error", "field"),
    [
        ({}, 400, "VALIDATION_ERROR", "request"),
        ({"user_id": None}, 400, "VALIDATION_ERROR", "user_id"),
        ({"project_id": None}, 400, "VALIDATION_ERROR", "project_id"),
        ({"allocation_percentage": None}, 400, "VALIDATION_ERROR", "allocation_percentage"),
        ({"start_date": None}, 400, "VALIDATION_ERROR", "start_date"),
        ({"allocation_percentage": 120}, 400, "VALIDATION_ERROR", "allocation_percentage"),
        ({"user_id": 999999}, 400, "INVALID_REFERENCE", "user_id"),
        ({"project_id": 999999}, 400, "INVALID_REFERENCE", "project_id"),
        ({"deliverable_id": 999999}, 400, "INVALID_REFERENCE", "deliverable_id"),
    ],
)
def test_update_validates_the_body(
    client: TestClient, seeded: Seeded, body: dict[str, Any], status: int, error: str, field: str
) -> None:
    """Empty bodies, nulls for required fields, bad values and unknown references are refused."""
    allocation_id = seeded.allocation_ids[("Kabir", "Gamma")]
    response = client.put(f"/allocations/{allocation_id}", json=body, headers=seeded.headers["PM"])
    assert error_of(response) == (status, error) and fields_of(response) == [field]


def test_update_missing_allocation_is_404(client: TestClient, seeded: Seeded) -> None:
    """PUT on an unknown id is 404."""
    response = client.put("/allocations/999999", json={"allocation_percentage": 10}, headers=seeded.headers["PM"])
    assert error_of(response) == (404, "NOT_FOUND")


# --- Delete -----------------------------------------------------------------------------------------


def test_delete_allocation_updates_the_risk_picture(client: TestClient, seeded: Seeded, db_session: Session) -> None:
    """DELETE is 204 with no body; without Priya's Beta allocation her conflict is gone and Beta drops 8 points."""
    allocation_id = seeded.allocation_ids[("Priya", "Beta")]
    headers = seeded.headers["PM"]
    response = client.delete(f"/allocations/{allocation_id}", headers=headers)
    assert response.status_code == 204 and response.content == b""
    assert error_of(client.get(f"/allocations/{allocation_id}", headers=headers)) == (404, "NOT_FOUND")
    assert error_of(client.delete(f"/allocations/{allocation_id}", headers=headers)) == (404, "NOT_FOUND")
    assert allocation_count(db_session) == 7
    beta = client.get(f"/projects/{seeded.project_ids['Beta']}", params={"as_of": T.isoformat()}, headers=headers)
    assert beta.json()["risk_score"] == 23


# --- RBAC (spec section 7: allocations are CRUD for ADMIN and PM, read-only for LEAD and VIEWER) ----


@pytest.mark.parametrize("role", ["ADMIN", "PM"])
def test_managers_have_full_crud_on_allocations(client: TestClient, seeded: Seeded, role: str) -> None:
    """ADMIN and PM: list, read, create, update and delete are all allowed."""
    headers = seeded.headers[role]
    assert client.get("/allocations", headers=headers).status_code == 200
    created = client.post("/allocations", json=body_for(seeded, "Sana", "Delta", 10, 30, 40), headers=headers)
    assert created.status_code == 201
    allocation_id = created.json()["id"]
    assert client.get(f"/allocations/{allocation_id}", headers=headers).status_code == 200
    updated = client.put(f"/allocations/{allocation_id}", json={"allocation_percentage": 20}, headers=headers)
    assert updated.status_code == 200
    assert client.delete(f"/allocations/{allocation_id}", headers=headers).status_code == 204


@pytest.mark.parametrize("role", ["LEAD", "VIEWER"])
def test_lead_and_viewer_can_read_but_not_change_allocations(
    client: TestClient, seeded: Seeded, db_session: Session, role: str
) -> None:
    """LEAD and VIEWER: reads are allowed; create, update and delete are 403 and change nothing."""
    headers = seeded.headers[role]
    allocation_id = seeded.allocation_ids[("Rohan", "Alpha")]
    assert client.get("/allocations", headers=headers).json()["total"] == 8
    assert client.get(f"/allocations/{allocation_id}", headers=headers).status_code == 200
    for response in (
        client.post("/allocations", json=body_for(seeded, "Sana", "Delta", 10, 30, 40), headers=headers),
        client.put(f"/allocations/{allocation_id}", json={"allocation_percentage": 100}, headers=headers),
        client.delete(f"/allocations/{allocation_id}", headers=headers),
    ):
        assert error_of(response) == (403, "ACCESS_DENIED")
    assert client.get(f"/allocations/{allocation_id}", headers=headers).json()["allocation_percentage"] == 80
    assert allocation_count(db_session) == 8
    assert audit_rows(db_session) == []


def test_allocations_require_a_token(client: TestClient, seeded: Seeded) -> None:
    """Every allocation route is 401 UNAUTHENTICATED without a bearer token."""
    allocation_id = seeded.allocation_ids[("Rohan", "Alpha")]
    for response in (
        client.get("/allocations"),
        client.get(f"/allocations/{allocation_id}"),
        client.post("/allocations", json=body_for(seeded, "Sana", "Delta", 10, 30, 40)),
        client.put(f"/allocations/{allocation_id}", json={"allocation_percentage": 10}),
        client.delete(f"/allocations/{allocation_id}"),
    ):
        assert error_of(response) == (401, "UNAUTHENTICATED")


# --- Transactions and audit -------------------------------------------------------------------------


def test_each_allocation_mutation_writes_one_audit_row(
    client: TestClient, seeded: Seeded, db_session: Session
) -> None:
    """Create (even with a warning), update and delete each write exactly one 'allocation' audit row."""
    headers = seeded.headers["ADMIN"]
    created = client.post("/allocations", json=body_for(seeded, "Priya", "Gamma", 50, 13, 15), headers=headers)
    assert created.json()["capacity_warning"] is not None
    allocation_id = created.json()["id"]
    rows = audit_rows(db_session)
    assert [(row.entity_type, row.entity_id, row.action) for row in rows] == [("allocation", allocation_id, "CREATE")]
    assert rows[0].actor_email == "admin@acme.example" and rows[0].before_state is None
    assert rows[0].after_state["allocation_percentage"] == 50 and rows[0].after_state["start_date"] == day(13)

    client.put(f"/allocations/{allocation_id}", json={"allocation_percentage": 20}, headers=headers)
    rows = audit_rows(db_session)
    assert len(rows) == 2 and (rows[-1].entity_id, rows[-1].action) == (allocation_id, "UPDATE")
    assert (rows[-1].before_state["allocation_percentage"], rows[-1].after_state["allocation_percentage"]) == (50, 20)

    client.delete(f"/allocations/{allocation_id}", headers=headers)
    rows = audit_rows(db_session)
    assert len(rows) == 3 and (rows[-1].entity_id, rows[-1].action) == (allocation_id, "DELETE")
    assert rows[-1].after_state is None and rows[-1].before_state["allocation_percentage"] == 20


def test_failed_allocation_mutations_write_no_audit_row(
    client: TestClient, seeded: Seeded, db_session: Session
) -> None:
    """Validation errors, bad references, missing records and denied roles leave no audit row and no change."""
    pm, lead = seeded.headers["PM"], seeded.headers["LEAD"]
    kabir_id = seeded.allocation_ids[("Kabir", "Gamma")]
    wrong_deliverable = seeded.deliverable_ids["Pilot Go-Live"]
    responses = [
        client.post("/allocations", json=body_for(seeded, "Priya", "Gamma", 10, 9, 8), headers=pm),
        client.post(
            "/allocations", json={**body_for(seeded, "Priya", "Gamma", 10, 80, 90), "user_id": 999999}, headers=pm
        ),
        client.post(
            "/allocations",
            json=body_for(seeded, "Priya", "Gamma", 10, 80, 90, deliverable_id=wrong_deliverable),
            headers=pm,
        ),
        client.post("/allocations", json=body_for(seeded, "Priya", "Gamma", 10, 80, 90), headers=lead),
        client.put(f"/allocations/{kabir_id}", json={"end_date": day(-41)}, headers=pm),
        client.put(f"/allocations/{kabir_id}", json={"deliverable_id": wrong_deliverable}, headers=pm),
        client.put("/allocations/999999", json={"allocation_percentage": 10}, headers=pm),
        client.delete("/allocations/999999", headers=pm),
        client.delete(f"/allocations/{kabir_id}", headers=lead),
    ]
    assert [response.status_code for response in responses] == [400, 400, 400, 403, 400, 400, 404, 404, 403]
    assert audit_rows(db_session) == []
    assert allocation_count(db_session) == 8
