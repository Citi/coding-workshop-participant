"""Authentication: registration, login, tokens, refresh and role changes (spec 5.8, 13.1)."""

from __future__ import annotations

import os
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import httpx
import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app import security
from app.config import get_settings
from app.db.models import ALL_TABLES, Department, User
from app.errors import Unauthenticated
from conftest import TEST_PASSWORD

USER_OUT_KEYS = {"id", "name", "email", "role", "department_id", "department_name", "created_at"}
CONTROL_CHARACTERS = "Must not contain control characters such as tabs or line breaks."
GONE = "The account for this token no longer exists."


def bearer(token: str) -> dict[str, str]:
    """Build an Authorization header for a token."""
    return {"Authorization": f"Bearer {token}"}


def register(client: TestClient, **overrides: Any) -> httpx.Response:
    """POST /auth/register with a valid body, overridden by keyword arguments."""
    body: dict[str, Any] = {
        "name": "New Person",
        "email": "new.person@test.example",
        "password": TEST_PASSWORD,
    }
    body.update(overrides)
    return client.post("/auth/register", json=body)


def login(client: TestClient, email: str, password: str = TEST_PASSWORD) -> httpx.Response:
    """POST /auth/login."""
    return client.post("/auth/login", json={"email": email, "password": password})


def get_me(client: TestClient, token: str) -> httpx.Response:
    """GET /auth/me with a bearer token."""
    return client.get("/auth/me", headers=bearer(token))


def refresh_with(client: TestClient, refresh_token: str) -> httpx.Response:
    """POST /auth/refresh with a refresh token."""
    return client.post("/auth/refresh", json={"refresh_token": refresh_token})


def assert_unauthenticated(response: httpx.Response) -> dict[str, Any]:
    """Check a 401 in the standard shape with a Bearer challenge; return the body."""
    assert response.status_code == 401, response.text
    assert response.headers["www-authenticate"] == "Bearer"
    body = response.json()
    assert set(body) == {"error", "message", "details"}
    assert body["error"] == "UNAUTHENTICATED"
    return body


def mint(claims: dict[str, Any], secret: str | None = None, algorithm: str = "HS256") -> str:
    """Sign arbitrary claims with the test JWT secret (or another key)."""
    return jwt.encode(claims, secret or os.environ["JWT_SECRET"], algorithm=algorithm)


def field_names(response: httpx.Response) -> list[str]:
    """The ``field`` of every detail in an error response, sorted."""
    return sorted(detail["field"] for detail in response.json()["details"])


# --- Registration ------------------------------------------------------------


def test_register_creates_a_viewer_with_lowercased_email(
    client: TestClient, db_session: Session
) -> None:
    """Registration yields a VIEWER; the email is stored lowercased; no hash is returned."""
    response = register(client, name="  Ann Example  ", email="  Ann.Example@Test.EXAMPLE ")
    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body) == USER_OUT_KEYS
    assert body["role"] == "VIEWER"
    assert body["name"] == "Ann Example"
    assert body["email"] == "ann.example@test.example"
    assert body["department_id"] is None and body["department_name"] is None
    assert "password" not in response.text and "$2b$" not in response.text
    stored = db_session.get(User, body["id"])
    assert stored is not None and stored.email == "ann.example@test.example"
    assert stored.password_hash.startswith("$2b$04$")
    assert security.verify_password(TEST_PASSWORD, stored.password_hash)


def test_register_with_a_department(client: TestClient, db_session: Session) -> None:
    """A department can be chosen at registration; its name is returned."""
    department = Department(name="Finance")
    db_session.add(department)
    db_session.commit()
    response = register(client, department_id=department.id)
    assert response.status_code == 201, response.text
    assert response.json()["department_id"] == department.id
    assert response.json()["department_name"] == "Finance"


@pytest.mark.parametrize("role", ["ADMIN", "VIEWER", None])
def test_register_rejects_a_role_field(
    client: TestClient, db_session: Session, role: str | None
) -> None:
    """A role in the body is a 400 VALIDATION_ERROR naming the field, and nothing is created."""
    response = register(client, role=role)
    assert response.status_code == 400
    body = response.json()
    assert body["error"] == "VALIDATION_ERROR"
    assert {"field": "role", "issue": "Extra inputs are not permitted"} in body["details"]
    assert db_session.scalars(select(User)).all() == []


def test_register_duplicate_email_is_a_conflict_ignoring_case(client: TestClient) -> None:
    """The same email in another case is a duplicate: 409 CONFLICT on the email field."""
    assert register(client, email="dup@test.example").status_code == 201
    response = register(client, email="DUP@Test.Example")
    assert response.status_code == 409
    body = response.json()
    assert body["error"] == "CONFLICT"
    assert body["details"][0]["field"] == "email"


def test_register_unknown_department_is_an_invalid_reference(client: TestClient) -> None:
    """A department id that does not exist is a 400 INVALID_REFERENCE on department_id."""
    response = register(client, department_id=999)
    assert response.status_code == 400
    assert response.json()["error"] == "INVALID_REFERENCE"
    assert response.json()["details"][0]["field"] == "department_id"


@pytest.mark.parametrize(
    ("password", "status"),
    [
        ("p" * 8, 201),
        ("p" * 72, 201),
        ("é" * 36, 201),  # 36 characters, 72 bytes
        ("  spaced password  ", 201),  # never trimmed
        ("p" * 7, 400),
        ("p" * 73, 400),
        ("é" * 37, 400),  # only 37 characters, but 74 bytes
    ],
)
def test_register_password_must_be_8_to_72_bytes(
    client: TestClient, password: str, status: int
) -> None:
    """The limit is in UTF-8 bytes, inclusive at 8 and 72; accepted passwords log in unchanged."""
    response = register(client, password=password)
    assert response.status_code == status, response.text
    if status == 201:
        assert login(client, "new.person@test.example", password).status_code == 200
        if password != password.strip():
            assert login(client, "new.person@test.example", password.strip()).status_code == 401
    else:
        body = response.json()
        assert body["error"] == "VALIDATION_ERROR"
        assert body["details"][0]["field"] == "password"
        assert "bytes" in body["details"][0]["issue"]


def test_a_nul_in_a_password_is_kept_not_truncated(client: TestClient) -> None:
    """bcrypt gets every byte: the text before a NUL is not an equivalent password.

    The password never reaches SQL (only its hash does), so a NUL is allowed there.
    """
    assert register(client, password="abcdefgh\x00tail").status_code == 201
    assert login(client, "new.person@test.example", "abcdefgh\x00tail").status_code == 200
    assert_unauthenticated(login(client, "new.person@test.example", "abcdefgh"))


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"email": "not-an-email"}, "email"),
        ({"email": "a@localhost"}, "email"),
        ({"email": "x" * 250 + "@t.example"}, "email"),
        ({"name": "   "}, "name"),
        ({"name": "n" * 151}, "name"),
        ({"name": "Tab\tName"}, "name"),
        ({"department_id": 0}, "department_id"),
        ({"department_id": "abc"}, "department_id"),
    ],
)
def test_register_validates_fields(
    client: TestClient, overrides: dict[str, Any], field: str
) -> None:
    """Bad input is a 400 VALIDATION_ERROR naming the field."""
    response = register(client, **overrides)
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"
    assert [detail["field"] for detail in response.json()["details"]] == [field]


def test_register_email_that_grows_past_255_when_lowercased(client: TestClient) -> None:
    """'İ' lowercases to two characters, so 255 characters can become 256: a 400, not a 500."""
    email = "İ" + "a" * 244 + "@t.example"
    assert len(email) == 255 and len(email.lower()) == 256
    response = register(client, email=email)
    assert response.status_code == 400
    assert response.json()["details"] == [
        {"field": "email", "issue": "The email address must be at most 255 characters."}
    ]


def test_register_password_that_is_not_encodable_text(client: TestClient) -> None:
    """A lone UTF-16 surrogate (legal in JSON escapes) cannot be hashed: a 400, not a 500."""
    response = client.post(
        "/auth/register",
        content=b'{"name": "A", "email": "a@test.example", "password": "abcdefgh\\ud800"}',
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 400, response.text
    assert response.json()["error"] == "VALIDATION_ERROR"
    assert response.json()["details"][0]["field"] == "password"


def test_register_requires_name_email_and_password(client: TestClient) -> None:
    """Each missing required field is listed."""
    response = client.post("/auth/register", json={})
    assert response.status_code == 400
    assert field_names(response) == ["email", "name", "password"]


# --- Login -------------------------------------------------------------------


def test_login_returns_tokens_and_the_user(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """Login gives access and refresh tokens with the documented claims, plus the user."""
    user = make_user("PM", email="pm.login@test.example")
    response = login(client, "PM.Login@Test.Example")
    assert response.status_code == 200, response.text
    body = response.json()
    settings = get_settings()
    assert set(body) == {"access_token", "refresh_token", "token_type", "expires_in", "user"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == settings.access_token_minutes * 60
    assert body["user"]["id"] == user.id and body["user"]["role"] == "PM"
    assert set(body["user"]) == USER_OUT_KEYS

    access = jwt.decode(body["access_token"], os.environ["JWT_SECRET"], algorithms=["HS256"])
    assert set(access) == {"sub", "role", "typ", "iat", "exp"}
    assert access["sub"] == str(user.id) and access["role"] == "PM" and access["typ"] == "access"
    assert access["exp"] - access["iat"] == settings.access_token_minutes * 60
    refresh = jwt.decode(body["refresh_token"], os.environ["JWT_SECRET"], algorithms=["HS256"])
    assert refresh["typ"] == "refresh" and refresh["sub"] == str(user.id)
    assert refresh["exp"] - refresh["iat"] == settings.refresh_token_hours * 3600
    assert jwt.get_unverified_header(body["access_token"])["alg"] == "HS256"


def test_wrong_password_and_unknown_email_get_the_same_401(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """Neither response reveals whether the email has an account."""
    make_user("VIEWER", email="known@test.example")
    wrong_password = assert_unauthenticated(login(client, "known@test.example", "not-the-pw"))
    unknown_email = assert_unauthenticated(login(client, "nobody@test.example", "not-the-pw"))
    assert wrong_password == unknown_email
    assert wrong_password["message"] == "Invalid email or password."


def test_unknown_email_still_costs_one_bcrypt_check(
    client: TestClient, make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch
) -> None:
    """An unknown email is checked against a dummy hash, so it costs as much as a wrong one."""
    make_user("VIEWER", email="known@test.example")
    security.simulate_password_check("warm-up")  # build the cached dummy hash before counting
    real_checkpw = bcrypt.checkpw
    calls: list[bytes] = []

    def counting_checkpw(password: bytes, hashed: bytes) -> bool:
        """Record which hash is checked, then check it as bcrypt would."""
        calls.append(hashed)
        return real_checkpw(password, hashed)

    monkeypatch.setattr(security.bcrypt, "checkpw", counting_checkpw)
    assert login(client, "nobody@test.example", "not-the-password").status_code == 401
    assert login(client, "known@test.example", "not-the-password").status_code == 401
    assert len(calls) == 2
    assert all(hashed.startswith(b"$2b$04$") for hashed in calls)


def test_login_with_an_over_long_password_is_401_not_500(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """bcrypt refuses more than 72 bytes; login treats that as wrong credentials."""
    make_user("VIEWER", email="known@test.example")
    assert_unauthenticated(login(client, "known@test.example", "p" * 100))


def test_login_requires_email_and_password(client: TestClient) -> None:
    """Missing or empty credentials are a 400 VALIDATION_ERROR, not a 401."""
    response = client.post("/auth/login", json={"email": "", "password": ""})
    assert response.status_code == 400
    assert field_names(response) == ["email", "password"]


@pytest.mark.parametrize(
    "email",
    [
        "a\x00@acme.example",
        "\x00",
        "known@test.example\x00",
        "a\tb@acme.example",
        "a\nb@acme.example",
    ],
)
def test_login_email_with_control_characters_is_400_not_500(
    client: TestClient, make_user: Callable[..., User], email: str
) -> None:
    """A NUL in the email reached the database query and gave a 500; now it is a 400.

    PostgreSQL cannot compare text containing NUL. No account can have a control
    character in its email (registration refuses them), so a 400 on ``email``
    says nothing about which addresses have accounts.
    """
    make_user("VIEWER", email="known@test.example")
    response = login(client, email, "not-the-password")
    assert response.status_code == 400, response.text
    body = response.json()
    assert body["error"] == "VALIDATION_ERROR"
    assert body["details"] == [{"field": "email", "issue": CONTROL_CHARACTERS}]


def test_login_password_with_a_nul_is_a_plain_401(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """The password never reaches SQL, so a NUL in it is just a wrong password, never a 500."""
    make_user("VIEWER", email="known@test.example")
    body = assert_unauthenticated(login(client, "known@test.example", "pass\x00word"))
    assert body["message"] == "Invalid email or password."


# --- Access tokens -----------------------------------------------------------


def test_me_returns_the_current_user(client: TestClient, make_user: Callable[..., User]) -> None:
    """GET /auth/me returns the signed-in user without the hash."""
    user = make_user("LEAD")
    response = get_me(client, security.create_access_token(user))
    assert response.status_code == 200
    assert response.json()["id"] == user.id and response.json()["role"] == "LEAD"
    assert set(response.json()) == USER_OUT_KEYS


def test_missing_token_is_401(client: TestClient) -> None:
    """No Authorization header gives 401 with a Bearer challenge."""
    body = assert_unauthenticated(client.get("/auth/me"))
    assert "Authorization" in body["message"]


@pytest.mark.parametrize(
    "authorization",
    [
        "Bearer garbage",
        "Bearer a.b.c",
        "Bearer two words",
        "Bearer",
        "Basic dXNlcjpwYXNz",
        "garbage",
    ],
)
def test_garbage_authorization_is_401(client: TestClient, authorization: str) -> None:
    """Malformed or non-Bearer credentials give 401."""
    assert_unauthenticated(client.get("/auth/me", headers={"Authorization": authorization}))


def _claims(user_id: int, **overrides: Any) -> dict[str, Any]:
    """Valid access-token claims for a user, overridden by keyword arguments."""
    now = datetime.now(timezone.utc)
    claims: dict[str, Any] = {
        "sub": str(user_id),
        "role": "ADMIN",
        "typ": "access",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    claims.update(overrides)
    return {key: value for key, value in claims.items() if value is not None}


def test_expired_access_token_is_401(client: TestClient, make_user: Callable[..., User]) -> None:
    """A token whose exp has passed is rejected, with a message saying so."""
    user = make_user("ADMIN")
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    token = mint(_claims(user.id, iat=past - timedelta(minutes=30), exp=past))
    body = assert_unauthenticated(get_me(client, token))
    assert "expired" in body["message"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"typ": None},
        {"exp": None},
        {"iat": None},
        {"role": None},
        {"sub": "not-a-number"},
        {"sub": "0"},
        {"sub": "99999999999999999999"},
        {"typ": "session"},
    ],
)
def test_tokens_with_bad_claims_are_401(
    client: TestClient, make_user: Callable[..., User], overrides: dict[str, Any]
) -> None:
    """Every claim is required and checked."""
    user = make_user("ADMIN")
    assert_unauthenticated(get_me(client, mint(_claims(user.id, **overrides))))


def test_tokens_signed_another_way_are_401(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """Another secret, the none algorithm and HS512 are all rejected."""
    user = make_user("ADMIN")
    claims = _claims(user.id)
    for token in (
        mint(claims, secret="another-secret-that-is-long-enough-for-hs256"),
        jwt.encode(claims, None, algorithm="none"),
        mint(claims, algorithm="HS512"),
    ):
        assert_unauthenticated(get_me(client, token))


# --- Refresh tokens ----------------------------------------------------------


def test_refresh_returns_a_working_access_token(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """POST /auth/refresh with the refresh token gives a new access token."""
    make_user("PM", email="pm@test.example")
    tokens = login(client, "pm@test.example").json()
    response = refresh_with(client, tokens["refresh_token"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"access_token", "token_type", "expires_in"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == get_settings().access_token_minutes * 60
    claims = jwt.decode(body["access_token"], os.environ["JWT_SECRET"], algorithms=["HS256"])
    assert claims["typ"] == "access"
    me = get_me(client, body["access_token"])
    assert me.status_code == 200 and me.json()["email"] == "pm@test.example"


def test_refresh_token_is_rejected_as_an_access_token(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """A refresh token cannot call protected routes."""
    make_user("ADMIN", email="admin@test.example")
    tokens = login(client, "admin@test.example").json()
    assert_unauthenticated(get_me(client, tokens["refresh_token"]))
    assert_unauthenticated(client.get("/users", headers=bearer(tokens["refresh_token"])))


def test_access_token_is_rejected_by_refresh(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """Only a refresh token can be exchanged at /auth/refresh."""
    make_user("ADMIN", email="admin@test.example")
    tokens = login(client, "admin@test.example").json()
    body = assert_unauthenticated(refresh_with(client, tokens["access_token"]))
    assert "refresh token" in body["message"]


def test_bad_refresh_tokens_are_401(client: TestClient, make_user: Callable[..., User]) -> None:
    """Garbage and expired refresh tokens are rejected; an empty one is a validation error."""
    user = make_user("ADMIN")
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    expired = mint(_claims(user.id, typ="refresh", iat=past - timedelta(hours=8), exp=past))
    assert_unauthenticated(refresh_with(client, "garbage"))
    assert "expired" in assert_unauthenticated(refresh_with(client, expired))["message"]
    assert refresh_with(client, "").status_code == 400
    assert client.post("/auth/refresh", json={}).status_code == 400


def test_tokens_of_a_deleted_user_are_401(
    client: TestClient,
    make_user: Callable[..., User],
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    """Deleting a user invalidates their access and refresh tokens at once."""
    victim = make_user("PM", email="leaving@test.example")
    tokens = login(client, "leaving@test.example").json()
    assert client.delete(f"/users/{victim.id}", headers=auth_headers("ADMIN")).status_code == 204
    body = assert_unauthenticated(get_me(client, tokens["access_token"]))
    assert body["message"] == GONE
    assert_unauthenticated(refresh_with(client, tokens["refresh_token"]))


def _truncate_like_reset(db: Session) -> None:
    """Empty every table and restart identities, as the ``reset`` task does."""
    db.execute(text(f"TRUNCATE {', '.join(ALL_TABLES)} RESTART IDENTITY CASCADE"))
    db.commit()
    db.expunge_all()  # forget the deleted rows, like a fresh session after a real reset


def test_tokens_from_before_a_reset_do_not_act_as_the_new_owner_of_the_id(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    """``reset`` restarts identities, so an old token must not act as the id's new owner.

    The old ADMIN's tokens were issued an hour before the reset, as in real use.
    After the reset a VIEWER gets the same id; without the check, the old access
    token was accepted as that VIEWER and the old refresh token minted new access
    tokens for them (the other way round, a VIEWER's token became an ADMIN's).
    """
    old_admin = make_user("ADMIN", email="old.admin@test.example")
    db_session.execute(text("UPDATE users SET created_at = now() - interval '1 day'"))
    db_session.commit()
    an_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    old_access = mint(_claims(old_admin.id, iat=an_hour_ago))
    old_refresh = mint(
        _claims(old_admin.id, typ="refresh", iat=an_hour_ago, exp=an_hour_ago + timedelta(hours=8))
    )
    assert get_me(client, old_access).json()["email"] == "old.admin@test.example"
    assert refresh_with(client, old_refresh).status_code == 200

    _truncate_like_reset(db_session)
    newcomer = make_user("VIEWER", email="someone.else@test.example")
    assert newcomer.id == old_admin.id

    assert assert_unauthenticated(get_me(client, old_access))["message"] == GONE
    assert assert_unauthenticated(refresh_with(client, old_refresh))["message"] == GONE
    fresh = login(client, "someone.else@test.example").json()
    assert get_me(client, fresh["access_token"]).json()["id"] == newcomer.id
    assert refresh_with(client, fresh["refresh_token"]).status_code == 200


@pytest.mark.parametrize(
    ("seconds_before_account", "status"),
    [
        (0, 200),
        (security.CLOCK_SKEW_SECONDS, 200),
        (security.CLOCK_SKEW_SECONDS + 1, 401),
    ],
)
def test_a_token_may_predate_its_account_only_by_the_clock_skew(
    client: TestClient, make_user: Callable[..., User], seconds_before_account: int, status: int
) -> None:
    """``iat`` (app clock, whole seconds) may trail ``created_at`` (database clock) a little."""
    user = make_user("VIEWER")
    issued_at = int(user.created_at.timestamp()) - seconds_before_account
    token = mint(_claims(user.id, iat=issued_at, exp=issued_at + 600))
    assert get_me(client, token).status_code == status


def test_role_changes_apply_immediately(
    client: TestClient,
    make_user: Callable[..., User],
    auth_headers: Callable[..., dict[str, str]],
) -> None:
    """The role is read from the database on every request, not from the token."""
    admin = auth_headers("ADMIN")
    lead = make_user("LEAD", email="lead@test.example")
    lead_token = bearer(security.create_access_token(lead))

    def create_department(name: str) -> int:
        """Try to create a department as the lead; return the status code."""
        return client.post("/departments", json={"name": name}, headers=lead_token).status_code

    def set_role(role: str) -> int:
        """Change the lead's role as the admin; return the status code."""
        return client.put(f"/users/{lead.id}", json={"role": role}, headers=admin).status_code

    assert create_department("Before") == 403
    assert set_role("ADMIN") == 200
    assert create_department("After") == 201
    assert client.get("/auth/me", headers=lead_token).json()["role"] == "ADMIN"

    assert set_role("VIEWER") == 200
    assert create_department("Again") == 403

    refreshed = refresh_with(client, security.create_refresh_token(lead)).json()["access_token"]
    claims = jwt.decode(refreshed, os.environ["JWT_SECRET"], algorithms=["HS256"])
    assert claims["role"] == "VIEWER"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/auth/me"),
        ("GET", "/users"),
        ("POST", "/users"),
        ("GET", "/users/1"),
        ("PUT", "/users/1"),
        ("DELETE", "/users/1"),
        ("GET", "/departments"),
        ("POST", "/departments"),
        ("GET", "/departments/1"),
        ("PUT", "/departments/1"),
        ("DELETE", "/departments/1"),
    ],
)
def test_protected_routes_need_a_token(client: TestClient, method: str, path: str) -> None:
    """All but health, register, login and refresh need a token; 401 comes before body checks."""
    assert_unauthenticated(client.request(method, path, json={}))


def test_public_routes_need_no_token(client: TestClient) -> None:
    """Health, register, login and refresh answer without a token (no 401 for a missing one)."""
    assert client.get("/health").status_code == 200
    assert register(client).status_code == 201
    assert login(client, "new.person@test.example").status_code == 200
    assert refresh_with(client, "x").status_code == 401


# --- Security helpers --------------------------------------------------------


def test_verify_password_never_raises() -> None:
    """Inputs bcrypt refuses count as a mismatch instead of raising."""
    stored = security.hash_password("correct horse")
    assert security.verify_password("correct horse", stored)
    assert not security.verify_password("p" * 73, stored)
    assert not security.verify_password("correct horse", "not-a-bcrypt-hash")
    assert not security.verify_password("\ud800", stored)


def test_require_roles_rejects_unknown_roles() -> None:
    """A typo in a role list fails at import time, not silently at request time."""
    with pytest.raises(ValueError):
        security.require_roles("ADMN")
    with pytest.raises(ValueError):
        security.require_roles()
    assert security.require_roles("ADMIN", "PM").__name__ == "require_admin_or_pm"


def test_decode_token_checks_the_expected_type(make_user: Callable[..., User]) -> None:
    """decode_token raises Unauthenticated for the wrong typ and ValueError for an unknown one."""
    user = make_user("VIEWER")
    access = security.create_access_token(user)
    assert security.decode_token(access, "access")["sub"] == str(user.id)
    with pytest.raises(Unauthenticated):
        security.decode_token(access, "refresh")
    with pytest.raises(ValueError):
        security.decode_token(access, "session")
