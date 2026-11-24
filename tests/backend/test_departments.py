"""Departments API: reads for all roles, ADMIN-only writes, uniqueness and in-use (spec 7, 8)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Department, Project, User
from app.security import create_access_token
from app.services import departments as departments_service

ROLES_WITHOUT_ADMIN = ("PM", "LEAD", "VIEWER")
DEPARTMENT_KEYS = {"id", "name", "created_at"}
CONTROL_CHARACTERS = "Must not contain control characters such as tabs or line breaks."
BIGINT_MAX = 2**63 - 1


def headers_for(user: User) -> dict[str, str]:
    """Authorization header for an existing user."""
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def error_of(response: httpx.Response) -> tuple[int, str]:
    """Status code and error code of an error response."""
    return response.status_code, response.json()["error"]


@pytest.fixture
def admin_headers(make_user: Callable[..., User]) -> dict[str, str]:
    """Authorization header for an ADMIN user."""
    return headers_for(make_user("ADMIN"))


@pytest.fixture
def make_department(db_session: Session) -> Callable[[str], Department]:
    """Factory that inserts a department directly."""

    def _make(name: str) -> Department:
        department = Department(name=name)
        db_session.add(department)
        db_session.commit()
        return department

    return _make


def make_project(db_session: Session, department_id: int, name: str = "Alpha") -> Project:
    """Insert a project in a department."""
    project = Project(
        project_name=name,
        department_id=department_id,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    db_session.add(project)
    db_session.commit()
    return project


# --- Create and read ---------------------------------------------------------


def test_create_and_get_a_department(client: TestClient, admin_headers: dict[str, str]) -> None:
    """POST is 201 with the trimmed name; GET by id returns the same record."""
    response = client.post("/departments", json={"name": "  Engineering  "}, headers=admin_headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body) == DEPARTMENT_KEYS
    assert body["name"] == "Engineering"
    fetched = client.get(f"/departments/{body['id']}", headers=admin_headers)
    assert fetched.status_code == 200 and fetched.json() == body


def test_duplicate_department_names_conflict_ignoring_case(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    """Names are unique ignoring case and surrounding spaces: 409 on the name field."""
    created = client.post("/departments", json={"name": "Finance"}, headers=admin_headers)
    assert created.status_code == 201
    for duplicate in ("Finance", "FINANCE", " finance "):
        response = client.post("/departments", json={"name": duplicate}, headers=admin_headers)
        assert error_of(response) == (409, "CONFLICT")
        assert response.json()["details"][0]["field"] == "name"


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({}, "name"),
        ({"name": ""}, "name"),
        ({"name": "   "}, "name"),
        ({"name": "x" * 101}, "name"),
        ({"name": 42}, "name"),
        ({"name": "Line\nBreak"}, "name"),
        ({"name": "Ops", "code": "OPS"}, "code"),
    ],
)
def test_create_department_validates_the_body(
    client: TestClient, admin_headers: dict[str, str], body: dict[str, object], field: str
) -> None:
    """Bad names and unknown fields are a 400 VALIDATION_ERROR naming the field."""
    response = client.post("/departments", json=body, headers=admin_headers)
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert [detail["field"] for detail in response.json()["details"]] == [field]


def test_get_missing_department_is_404(client: TestClient, admin_headers: dict[str, str]) -> None:
    """Unknown ids are 404 NOT_FOUND; malformed ids are 400."""
    for path, expected in (
        ("/departments/999999", (404, "NOT_FOUND")),
        ("/departments/zero", (400, "VALIDATION_ERROR")),
        ("/departments/0", (400, "VALIDATION_ERROR")),
    ):
        assert error_of(client.get(path, headers=admin_headers)) == expected


def test_list_departments_with_search_and_pagination(
    client: TestClient,
    admin_headers: dict[str, str],
    make_department: Callable[[str], Department],
) -> None:
    """Lists are {items, total} ordered by id; q filters by name; limit and offset page."""

    def listed(**params: object) -> dict[str, object]:
        """The list response body for these query parameters."""
        return client.get("/departments", params=params, headers=admin_headers).json()

    for name in ("Engineering", "Marketing", "Finance", "Operations", "Human Resources"):
        make_department(name)
    everything = listed()
    assert everything["total"] == 5
    assert [item["name"] for item in everything["items"]] == [
        "Engineering",
        "Marketing",
        "Finance",
        "Operations",
        "Human Resources",
    ]
    page = listed(limit=2, offset=1)
    assert page["total"] == 5
    assert [item["name"] for item in page["items"]] == ["Marketing", "Finance"]
    search = listed(q="ING")
    assert [item["name"] for item in search["items"]] == ["Engineering", "Marketing"]
    assert search["total"] == 2
    assert listed(q="zzz") == {"items": [], "total": 0}
    assert listed(offset=5) == {"items": [], "total": 5}


@pytest.mark.parametrize(
    "params", [{"limit": 201}, {"limit": 0}, {"offset": -5}, {"limit": "many"}]
)
def test_list_departments_rejects_bad_paging(
    client: TestClient, admin_headers: dict[str, str], params: dict[str, object]
) -> None:
    """limit must be 1-200 and offset >= 0: otherwise 400, not 422."""
    response = client.get("/departments", params=params, headers=admin_headers)
    assert error_of(response) == (400, "VALIDATION_ERROR")


@pytest.mark.parametrize("role", ["ADMIN", "VIEWER"])
@pytest.mark.parametrize("q", ["\x00", "Fin\x00", "\x01", "a\tb", "x" * 101])
def test_bad_search_text_is_400_not_500(
    client: TestClient, make_user: Callable[..., User], role: str, q: str
) -> None:
    """A NUL in q reached the database and gave a 500 for every role; now q is checked first.

    Control characters (no department name holds one) and names over 100
    characters are a 400 on ``q``.
    """
    headers = headers_for(make_user(role))
    response = client.get("/departments", params={"q": q}, headers=headers)
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert [detail["field"] for detail in response.json()["details"]] == ["q"]
    if len(q) <= 100:
        assert response.json()["details"][0]["issue"] == CONTROL_CHARACTERS


@pytest.mark.parametrize("offset", [BIGINT_MAX, BIGINT_MAX + 1, 10**20])
def test_an_offset_beyond_bigint_is_not_a_500(
    client: TestClient,
    admin_headers: dict[str, str],
    make_department: Callable[[str], Department],
    offset: int,
) -> None:
    """PostgreSQL's OFFSET is a BIGINT; larger values reached it and gave a 500.

    A page past the last match is now empty without a query. Once
    ``app/api/deps.py`` caps ``offset`` at the BIGINT maximum, larger values are a
    400 on ``offset`` instead; either answer is fine, a 500 is not.
    """
    make_department("Finance")
    response = client.get("/departments", params={"offset": offset}, headers=admin_headers)
    if response.status_code == 400:
        assert offset > BIGINT_MAX
        assert [detail["field"] for detail in response.json()["details"]] == ["offset"]
    else:
        assert response.status_code == 200, response.text
        assert response.json() == {"items": [], "total": 1}


# --- Update ------------------------------------------------------------------


def test_rename_a_department(
    client: TestClient,
    admin_headers: dict[str, str],
    make_department: Callable[[str], Department],
) -> None:
    """PUT renames; a case-only change of one's own name is allowed; another's name is 409."""
    engineering = make_department("Engineering")
    make_department("Finance")
    url = f"/departments/{engineering.id}"
    renamed = client.put(url, json={"name": "Platform Engineering"}, headers=admin_headers)
    assert renamed.status_code == 200 and renamed.json()["name"] == "Platform Engineering"
    recased = client.put(url, json={"name": "PLATFORM ENGINEERING"}, headers=admin_headers)
    assert recased.status_code == 200 and recased.json()["name"] == "PLATFORM ENGINEERING"
    taken = client.put(url, json={"name": "finance"}, headers=admin_headers)
    assert error_of(taken) == (409, "CONFLICT")
    assert client.get(url, headers=admin_headers).json()["name"] == "PLATFORM ENGINEERING"


def test_update_department_errors(
    client: TestClient,
    admin_headers: dict[str, str],
    make_department: Callable[[str], Department],
) -> None:
    """Unknown id is 404; a missing or empty name is 400."""
    department = make_department("Finance")
    url = f"/departments/{department.id}"
    missing = client.put("/departments/999999", json={"name": "X"}, headers=admin_headers)
    assert error_of(missing) == (404, "NOT_FOUND")
    for body in ({}, {"name": ""}):
        response = client.put(url, json=body, headers=admin_headers)
        assert error_of(response) == (400, "VALIDATION_ERROR")


# --- Delete ------------------------------------------------------------------


def test_delete_a_department(
    client: TestClient,
    admin_headers: dict[str, str],
    make_department: Callable[[str], Department],
    make_user: Callable[..., User],
    db_session: Session,
) -> None:
    """DELETE is 204 with no body; members keep their accounts without a department; again 404."""
    department = make_department("Marketing")
    member = make_user("VIEWER", department_id=department.id)
    url = f"/departments/{department.id}"
    response = client.delete(url, headers=admin_headers)
    assert response.status_code == 204 and response.content == b""
    assert error_of(client.get(url, headers=admin_headers)) == (404, "NOT_FOUND")
    assert error_of(client.delete(url, headers=admin_headers)) == (404, "NOT_FOUND")
    db_session.expire_all()
    assert db_session.get(User, member.id).department_id is None


def test_department_used_by_projects_cannot_be_deleted(
    client: TestClient,
    admin_headers: dict[str, str],
    make_department: Callable[[str], Department],
    db_session: Session,
) -> None:
    """A department that still owns projects is 409 CONFLICT, and it stays."""
    department = make_department("Engineering")
    make_project(db_session, department.id, "Alpha")
    make_project(db_session, department.id, "Beta")
    response = client.delete(f"/departments/{department.id}", headers=admin_headers)
    assert error_of(response) == (409, "CONFLICT")
    assert "2 project(s)" in response.json()["message"]
    assert client.get(f"/departments/{department.id}", headers=admin_headers).status_code == 200


# --- Races between the pre-checks and the database constraints ---------------


def test_a_name_taken_after_the_check_is_still_a_409(
    client: TestClient,
    admin_headers: dict[str, str],
    make_department: Callable[[str], Department],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If a concurrent request takes the name after the check, the index still gives 409."""
    make_department("Finance")
    other = make_department("Operations")
    monkeypatch.setattr(departments_service, "_ensure_name_free", lambda *args, **kwargs: None)
    for response in (
        client.post("/departments", json={"name": "FINANCE"}, headers=admin_headers),
        client.put(f"/departments/{other.id}", json={"name": "finance"}, headers=admin_headers),
    ):
        assert error_of(response) == (409, "CONFLICT")
        assert response.json()["details"][0]["field"] == "name"
    assert client.get("/departments", headers=admin_headers).json()["total"] == 2


def test_a_project_added_after_the_in_use_check_still_blocks_delete(
    client: TestClient,
    admin_headers: dict[str, str],
    make_department: Callable[[str], Department],
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ON DELETE RESTRICT catches a project made after the check: the same in-use 409."""
    department = make_department("Engineering")
    make_project(db_session, department.id)
    monkeypatch.setattr(departments_service, "_project_count", lambda db, department_id: 0)
    response = client.delete(f"/departments/{department.id}", headers=admin_headers)
    assert error_of(response) == (409, "CONFLICT")
    assert response.json()["message"] == (
        "Department 'Engineering' still has projects. Move or delete them first."
    )
    assert client.get(f"/departments/{department.id}", headers=admin_headers).status_code == 200


def test_other_integrity_errors_are_passed_on_unchanged(db_session: Session) -> None:
    """Only the expected SQLSTATE becomes a Conflict; anything else reaches the global handler."""
    for flush in (departments_service._flush_name, departments_service._flush_delete):
        db_session.add(Department(name=None))  # NOT NULL violation (23502)
        with pytest.raises(IntegrityError):
            flush(db_session, "x")
        db_session.rollback()


# --- RBAC (spec 7: departments are CRUD for ADMIN, read-only for the rest) ---


def test_admin_can_do_everything_on_departments(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    """ADMIN: list, create, read, update and delete are all allowed."""
    assert client.get("/departments", headers=admin_headers).status_code == 200
    created = client.post("/departments", json={"name": "Operations"}, headers=admin_headers)
    assert created.status_code == 201
    url = f"/departments/{created.json()['id']}"
    assert client.get(url, headers=admin_headers).status_code == 200
    assert client.put(url, json={"name": "Ops"}, headers=admin_headers).status_code == 200
    assert client.delete(url, headers=admin_headers).status_code == 204


@pytest.mark.parametrize("role", ROLES_WITHOUT_ADMIN)
def test_other_roles_can_read_departments(
    client: TestClient,
    make_user: Callable[..., User],
    make_department: Callable[[str], Department],
    role: str,
) -> None:
    """PM, LEAD and VIEWER: listing and reading departments is allowed."""
    department = make_department("Finance")
    headers = headers_for(make_user(role))
    assert client.get("/departments", headers=headers).json()["total"] == 1
    fetched = client.get(f"/departments/{department.id}", headers=headers)
    assert fetched.json()["name"] == "Finance"


@pytest.mark.parametrize("role", ROLES_WITHOUT_ADMIN)
def test_other_roles_cannot_change_departments(
    client: TestClient,
    make_user: Callable[..., User],
    make_department: Callable[[str], Department],
    role: str,
) -> None:
    """PM, LEAD and VIEWER: create, rename and delete are 403 ACCESS_DENIED; nothing changes."""
    department = make_department("Finance")
    headers = headers_for(make_user(role))
    url = f"/departments/{department.id}"
    for response in (
        client.post("/departments", json={"name": "Shadow IT"}, headers=headers),
        client.put(url, json={"name": "Renamed"}, headers=headers),
        client.delete(url, headers=headers),
    ):
        assert error_of(response) == (403, "ACCESS_DENIED")
    listing = client.get("/departments", headers=headers).json()
    assert listing["total"] == 1 and listing["items"][0]["name"] == "Finance"
