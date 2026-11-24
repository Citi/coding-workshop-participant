"""Users API: reads for every role, ADMIN-only writes, filters, paging and errors (spec 7, 8)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Department, Project, ResourceAllocation, User
from app.security import create_access_token
from app.services import users as users_service
from conftest import TEST_PASSWORD

ROLES_WITHOUT_ADMIN = ("PM", "LEAD", "VIEWER")
CONTROL_CHARACTERS = "Must not contain control characters such as tabs or line breaks."
BIGINT_MAX = 2**63 - 1


def headers_for(user: User) -> dict[str, str]:
    """Authorization header for an existing user."""
    return {"Authorization": f"Bearer {create_access_token(user)}"}


@pytest.fixture
def admin(make_user: Callable[..., User]) -> User:
    """An ADMIN user."""
    return make_user("ADMIN", email="admin@test.example", name="Asha Admin")


@pytest.fixture
def admin_headers(admin: User) -> dict[str, str]:
    """Authorization header for the ADMIN user."""
    return headers_for(admin)


@pytest.fixture
def departments(db_session: Session) -> dict[str, int]:
    """Two departments, by name."""
    rows = [Department(name="Engineering"), Department(name="Finance")]
    db_session.add_all(rows)
    db_session.commit()
    return {row.name: row.id for row in rows}


def new_user(**overrides: object) -> dict[str, object]:
    """A valid POST /users body."""
    body: dict[str, object] = {
        "name": "Priya Nair",
        "email": "priya.nair@test.example",
        "password": TEST_PASSWORD,
        "role": "LEAD",
    }
    body.update(overrides)
    return body


def error_of(response: httpx.Response) -> tuple[int, str]:
    """Status code and error code of an error response."""
    return response.status_code, response.json()["error"]


def login_status(client: TestClient, email: str, password: str) -> int:
    """Status code of POST /auth/login with these credentials."""
    return client.post("/auth/login", json={"email": email, "password": password}).status_code


# --- Create ------------------------------------------------------------------


def test_admin_creates_a_user_with_role_and_department(
    client: TestClient, admin_headers: dict[str, str], departments: dict[str, int]
) -> None:
    """POST /users is 201 and returns the user with its department name, never the hash."""
    response = client.post(
        "/users",
        json=new_user(
            email="Priya.Nair@Test.Example", role="PM", department_id=departments["Engineering"]
        ),
        headers=admin_headers,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == "priya.nair@test.example"
    assert body["role"] == "PM"
    assert body["department_id"] == departments["Engineering"]
    assert body["department_name"] == "Engineering"
    assert "password_hash" not in body and "$2b$" not in response.text
    login = client.post(
        "/auth/login", json={"email": "priya.nair@test.example", "password": TEST_PASSWORD}
    )
    assert login.status_code == 200 and login.json()["user"]["role"] == "PM"


@pytest.mark.parametrize(
    ("body", "field"),
    [
        (new_user(role="BOSS"), "role"),
        ({key: value for key, value in new_user().items() if key != "role"}, "role"),
        (new_user(password="p" * 73), "password"),
        (new_user(password="short"), "password"),
        (new_user(email="nope"), "email"),
        (new_user(department_id=-1), "department_id"),
        (new_user(is_admin=True), "is_admin"),
        (new_user(password_hash="$2b$04$abc"), "password_hash"),
    ],
)
def test_create_user_validates_the_body(
    client: TestClient, admin_headers: dict[str, str], body: dict[str, object], field: str
) -> None:
    """Invalid or unknown fields are a 400 VALIDATION_ERROR naming the field."""
    response = client.post("/users", json=body, headers=admin_headers)
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert field in [detail["field"] for detail in response.json()["details"]]


def test_create_user_with_a_taken_email_is_409(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    """Emails are unique ignoring case, including the admin's own."""
    assert client.post("/users", json=new_user(), headers=admin_headers).status_code == 201
    for email in ("PRIYA.NAIR@test.example", "Admin@Test.Example"):
        response = client.post("/users", json=new_user(email=email), headers=admin_headers)
        assert error_of(response) == (409, "CONFLICT")


def test_create_user_with_an_unknown_department_is_400(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    """A department that does not exist is INVALID_REFERENCE on department_id."""
    response = client.post("/users", json=new_user(department_id=424242), headers=admin_headers)
    assert error_of(response) == (400, "INVALID_REFERENCE")
    assert response.json()["details"] == [
        {"field": "department_id", "issue": "No department has id 424242."}
    ]


# --- Read --------------------------------------------------------------------


def test_get_user_and_404(client: TestClient, admin: User, admin_headers: dict[str, str]) -> None:
    """GET /users/{id} returns the user; an unknown id is 404; a malformed id is 400."""
    response = client.get(f"/users/{admin.id}", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Asha Admin"
    assert error_of(client.get("/users/999999", headers=admin_headers)) == (404, "NOT_FOUND")
    for bad_id in ("0", "abc", "1.5", "99999999999999999999"):
        response = client.get(f"/users/{bad_id}", headers=admin_headers)
        assert error_of(response) == (400, "VALIDATION_ERROR")


@pytest.fixture
def people(
    make_user: Callable[..., User], admin: User, departments: dict[str, int]
) -> dict[str, User]:
    """A small directory: the admin plus four users across roles and departments."""
    engineering, finance = departments["Engineering"], departments["Finance"]
    return {
        "admin": admin,
        "vikram": make_user(
            "PM", name="Vikram Shah", email="pm@acme.test", department_id=engineering
        ),
        "rohan": make_user(
            "LEAD", name="Rohan Das", email="lead@acme.test", department_id=engineering
        ),
        "neha": make_user(
            "VIEWER", name="Neha Kapoor", email="viewer@acme.test", department_id=finance
        ),
        "meera": make_user("PM", name="Meera 100%_Iyer", email="meera@acme.test"),
    }


def names(response: httpx.Response) -> list[str]:
    """Names in a list response, in order."""
    assert response.status_code == 200, response.text
    return [item["name"] for item in response.json()["items"]]


def test_list_users_filters(
    client: TestClient,
    admin_headers: dict[str, str],
    people: dict[str, User],
    departments: dict[str, int],
) -> None:
    """q matches name or email ignoring case; role and department_id narrow; filters combine."""

    def listed(**params: object) -> list[str]:
        """Names listed for these query parameters, in order."""
        return names(client.get("/users", params=params, headers=admin_headers))

    engineering = departments["Engineering"]
    assert listed(q="KAPOOR") == ["Neha Kapoor"]
    assert listed(q="acme.TEST") == ["Vikram Shah", "Rohan Das", "Neha Kapoor", "Meera 100%_Iyer"]
    assert listed(role="PM") == ["Vikram Shah", "Meera 100%_Iyer"]
    assert listed(department_id=engineering) == ["Vikram Shah", "Rohan Das"]
    assert listed(department_id=engineering, role="LEAD") == ["Rohan Das"]
    # LIKE wildcards in q are literal characters.
    assert listed(q="%_") == ["Meera 100%_Iyer"]
    assert listed(q="   ") == listed()
    empty = client.get("/users", params={"department_id": 999}, headers=admin_headers)
    assert empty.json() == {"items": [], "total": 0}


def test_list_users_pagination(
    client: TestClient, admin_headers: dict[str, str], people: dict[str, User]
) -> None:
    """limit and offset page through users ordered by id; total counts every match."""
    everyone = client.get("/users", headers=admin_headers).json()
    assert everyone["total"] == 5 and len(everyone["items"]) == 5
    ids = [item["id"] for item in everyone["items"]]
    assert ids == sorted(ids)
    page = client.get("/users", params={"limit": 2, "offset": 2}, headers=admin_headers).json()
    assert page["total"] == 5
    assert [item["id"] for item in page["items"]] == ids[2:4]
    past_the_end = client.get("/users", params={"offset": 10}, headers=admin_headers)
    assert past_the_end.json() == {"items": [], "total": 5}
    assert client.get("/users", params={"limit": 200}, headers=admin_headers).status_code == 200


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"limit": 201}, "limit"),
        ({"limit": 0}, "limit"),
        ({"offset": -1}, "offset"),
        ({"role": "BOSS"}, "role"),
        ({"department_id": "x"}, "department_id"),
        ({"q": "x" * 256}, "q"),
    ],
)
def test_list_users_rejects_bad_query_parameters(
    client: TestClient, admin_headers: dict[str, str], params: dict[str, object], field: str
) -> None:
    """limit above 200 and other bad parameters are 400, not 422."""
    response = client.get("/users", params=params, headers=admin_headers)
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert [detail["field"] for detail in response.json()["details"]] == [field]


@pytest.mark.parametrize("role", ["ADMIN", "VIEWER"])
@pytest.mark.parametrize("q", ["\x00", "a\x00", "Neha\x00Kapoor", "\x01", "a\tb"])
def test_search_text_with_control_characters_is_400_not_500(
    client: TestClient, make_user: Callable[..., User], role: str, q: str
) -> None:
    """A NUL in q reached the database and gave a 500 for every role; now q is checked first.

    PostgreSQL cannot compare text containing NUL. No stored name or email holds a
    control character, so refusing all of them loses no possible match.
    """
    response = client.get("/users", params={"q": q}, headers=headers_for(make_user(role)))
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert response.json()["details"] == [{"field": "q", "issue": CONTROL_CHARACTERS}]


@pytest.mark.parametrize("offset", [BIGINT_MAX, BIGINT_MAX + 1, 10**20])
def test_an_offset_beyond_bigint_is_not_a_500(
    client: TestClient, admin_headers: dict[str, str], offset: int
) -> None:
    """PostgreSQL's OFFSET is a BIGINT; larger values reached it and gave a 500.

    A page past the last match is now empty without a query. Once
    ``app/api/deps.py`` caps ``offset`` at the BIGINT maximum, larger values are a
    400 on ``offset`` instead; either answer is fine, a 500 is not.
    """
    response = client.get("/users", params={"offset": offset}, headers=admin_headers)
    if response.status_code == 400:
        assert offset > BIGINT_MAX
        assert [detail["field"] for detail in response.json()["details"]] == ["offset"]
    else:
        assert response.status_code == 200, response.text
        assert response.json() == {"items": [], "total": 1}


# --- Update ------------------------------------------------------------------


def test_update_user_fields(
    client: TestClient,
    admin_headers: dict[str, str],
    make_user: Callable[..., User],
    departments: dict[str, int],
) -> None:
    """PUT changes only the fields sent; department_id null clears the department."""
    engineering = departments["Engineering"]
    user = make_user(
        "VIEWER", name="Old Name", email="old@test.example", department_id=departments["Finance"]
    )
    response = client.put(
        f"/users/{user.id}",
        json={
            "name": "New Name",
            "email": "NEW@Test.Example",
            "role": "LEAD",
            "department_id": engineering,
        },
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["name"], body["email"], body["role"]) == ("New Name", "new@test.example", "LEAD")
    assert (body["department_id"], body["department_name"]) == (engineering, "Engineering")

    response = client.put(f"/users/{user.id}", json={"department_id": None}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["department_id"] is None and response.json()["department_name"] is None
    assert response.json()["name"] == "New Name" and response.json()["role"] == "LEAD"
    assert client.get(f"/users/{user.id}", headers=admin_headers).json() == response.json()


def test_update_user_password(
    client: TestClient, admin_headers: dict[str, str], make_user: Callable[..., User]
) -> None:
    """A new password works at once and the old one stops working."""
    user = make_user("VIEWER", email="pw@test.example")
    new_password = "a brand new password"
    changed = client.put(
        f"/users/{user.id}", json={"password": new_password}, headers=admin_headers
    )
    assert changed.status_code == 200
    assert login_status(client, "pw@test.example", TEST_PASSWORD) == 401
    assert login_status(client, "pw@test.example", new_password) == 200


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({}, "request"),
        ({"name": None}, "name"),
        ({"email": None}, "email"),
        ({"role": None}, "role"),
        ({"password": None}, "password"),
        ({"role": "OWNER"}, "role"),
        ({"password": "p" * 73}, "password"),
        ({"id": 5}, "id"),
    ],
)
def test_update_user_validates_the_body(
    client: TestClient,
    admin_headers: dict[str, str],
    make_user: Callable[..., User],
    body: dict[str, object],
    field: str,
) -> None:
    """An empty body, nulls for required fields and bad values are 400 naming the field."""
    user = make_user("VIEWER")
    response = client.put(f"/users/{user.id}", json=body, headers=admin_headers)
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert [detail["field"] for detail in response.json()["details"]] == [field]


def test_update_user_conflicts_and_missing_references(
    client: TestClient, admin_headers: dict[str, str], make_user: Callable[..., User]
) -> None:
    """Another user's email is 409; one's own is fine; unknown user 404; unknown department 400."""

    def put(user_id: int, body: dict[str, object]) -> httpx.Response:
        """PUT /users/{user_id} as the admin."""
        return client.put(f"/users/{user_id}", json=body, headers=admin_headers)

    first = make_user("VIEWER", email="first@test.example")
    make_user("VIEWER", email="second@test.example")
    taken = put(first.id, {"email": "Second@test.example"})
    assert error_of(taken) == (409, "CONFLICT")
    assert taken.json()["details"][0]["field"] == "email"
    assert put(first.id, {"email": "FIRST@test.example"}).status_code == 200
    assert error_of(put(999999, {"name": "X"})) == (404, "NOT_FOUND")
    assert error_of(put(first.id, {"department_id": 999})) == (400, "INVALID_REFERENCE")


def test_admin_cannot_change_their_own_role(
    client: TestClient, admin: User, admin_headers: dict[str, str]
) -> None:
    """Changing one's own role is 409; other self-edits, and restating the same role, are fine."""
    response = client.put(f"/users/{admin.id}", json={"role": "VIEWER"}, headers=admin_headers)
    assert error_of(response) == (409, "CONFLICT")
    assert response.json()["details"][0]["field"] == "role"
    assert client.get("/auth/me", headers=admin_headers).json()["role"] == "ADMIN"
    same = client.put(
        f"/users/{admin.id}", json={"role": "ADMIN", "name": "Asha R."}, headers=admin_headers
    )
    assert same.status_code == 200 and same.json()["name"] == "Asha R."


def test_admin_can_change_another_admins_role(
    client: TestClient, admin_headers: dict[str, str], make_user: Callable[..., User]
) -> None:
    """The self-protection rule applies only to oneself."""
    other = make_user("ADMIN")
    response = client.put(f"/users/{other.id}", json={"role": "PM"}, headers=admin_headers)
    assert response.status_code == 200 and response.json()["role"] == "PM"


# --- Delete ------------------------------------------------------------------


def test_delete_user(
    client: TestClient, admin_headers: dict[str, str], make_user: Callable[..., User]
) -> None:
    """DELETE is 204 with an empty body; the user is gone; deleting again is 404."""
    user = make_user("VIEWER")
    response = client.delete(f"/users/{user.id}", headers=admin_headers)
    assert response.status_code == 204
    assert response.content == b""
    assert error_of(client.get(f"/users/{user.id}", headers=admin_headers)) == (404, "NOT_FOUND")
    again = client.delete(f"/users/{user.id}", headers=admin_headers)
    assert error_of(again) == (404, "NOT_FOUND")


def test_admin_cannot_delete_themselves(
    client: TestClient, admin: User, admin_headers: dict[str, str]
) -> None:
    """Deleting one's own account is 409 and the account stays."""
    response = client.delete(f"/users/{admin.id}", headers=admin_headers)
    assert error_of(response) == (409, "CONFLICT")
    assert client.get("/auth/me", headers=admin_headers).status_code == 200


def test_delete_user_releases_projects_and_allocations(
    client: TestClient,
    admin_headers: dict[str, str],
    make_user: Callable[..., User],
    departments: dict[str, int],
    db_session: Session,
) -> None:
    """The schema's ON DELETE rules apply: projects lose their PM; allocations go."""
    pm = make_user("PM")
    project = Project(
        project_name="Alpha",
        department_id=departments["Engineering"],
        project_manager_id=pm.id,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    db_session.add(project)
    db_session.flush()
    db_session.add(
        ResourceAllocation(
            user_id=pm.id,
            project_id=project.id,
            allocation_percentage=50,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 6, 30),
        )
    )
    db_session.commit()
    assert client.delete(f"/users/{pm.id}", headers=admin_headers).status_code == 204
    db_session.expire_all()
    assert db_session.get(Project, project.id).project_manager_id is None
    assert db_session.query(ResourceAllocation).count() == 0


# --- Races between the pre-checks and the database constraints ---------------


def test_an_email_taken_after_the_check_is_still_a_409(
    client: TestClient,
    admin_headers: dict[str, str],
    make_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If a concurrent request takes the email after the check, the index still gives 409."""
    make_user("VIEWER", email="taken@test.example")
    other = make_user("VIEWER", email="other@test.example")
    monkeypatch.setattr(users_service, "_ensure_email_free", lambda *args, **kwargs: None)
    late_registration = {"name": "Late", "email": "Taken@Test.Example", "password": TEST_PASSWORD}
    for response in (
        client.post("/users", json=new_user(email="TAKEN@test.example"), headers=admin_headers),
        client.put(
            f"/users/{other.id}", json={"email": "taken@test.example"}, headers=admin_headers
        ),
        client.post("/auth/register", json=late_registration),
    ):
        assert error_of(response) == (409, "CONFLICT")
        assert response.json()["details"][0]["field"] == "email"


def test_other_integrity_errors_are_passed_on_unchanged(db_session: Session) -> None:
    """Only a unique violation becomes the email Conflict; a CHECK violation is re-raised."""
    db_session.add(User(name="X", email="x@test.example", password_hash="h", role="BOSS"))
    with pytest.raises(IntegrityError):
        users_service._flush_email(db_session, "x@test.example")
    db_session.rollback()


# --- RBAC (spec 7: users are CRUD for ADMIN, read-only for everyone else) ----


def test_admin_can_do_everything_on_users(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    """ADMIN: list, create, read, update and delete are all allowed."""
    assert client.get("/users", headers=admin_headers).status_code == 200
    created = client.post("/users", json=new_user(), headers=admin_headers)
    assert created.status_code == 201
    url = f"/users/{created.json()['id']}"
    assert client.get(url, headers=admin_headers).status_code == 200
    assert client.put(url, json={"role": "PM"}, headers=admin_headers).status_code == 200
    assert client.delete(url, headers=admin_headers).status_code == 204


@pytest.mark.parametrize("role", ROLES_WITHOUT_ADMIN)
def test_other_roles_can_read_users(
    client: TestClient, make_user: Callable[..., User], admin: User, role: str
) -> None:
    """PM, LEAD and VIEWER: listing and reading users is allowed."""
    headers = headers_for(make_user(role))
    assert client.get("/users", headers=headers).json()["total"] == 2
    assert client.get(f"/users/{admin.id}", headers=headers).status_code == 200


@pytest.mark.parametrize("role", ROLES_WITHOUT_ADMIN)
def test_other_roles_cannot_change_users(
    client: TestClient, make_user: Callable[..., User], admin: User, role: str
) -> None:
    """PM, LEAD and VIEWER: create, update and delete are 403 ACCESS_DENIED, even on themselves."""
    me = make_user(role)
    headers = headers_for(me)
    denied = [
        client.post("/users", json=new_user(), headers=headers),
        client.put(f"/users/{admin.id}", json={"name": "Hacked"}, headers=headers),
        client.put(f"/users/{me.id}", json={"role": "ADMIN"}, headers=headers),
        client.delete(f"/users/{admin.id}", headers=headers),
        client.delete(f"/users/{me.id}", headers=headers),
    ]
    for response in denied:
        assert error_of(response) == (403, "ACCESS_DENIED")
        assert role in response.json()["message"]
    assert client.get("/auth/me", headers=headers).json()["role"] == role
    assert client.get("/users", headers=headers).json()["total"] == 2
