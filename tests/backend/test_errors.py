"""Error handling: one error shape, 400 instead of 422, nothing internal leaked (spec 5.7)."""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import get_db
from app.main import create_app
from app.security import create_access_token

ERROR_KEYS = {"error", "message", "details"}
SECRET_DETAIL = "internal detail that must never reach the client"


def assert_error(response: httpx.Response, status: int, code: str) -> dict[str, Any]:
    """Check the standard error shape, status and code; return the body."""
    assert response.status_code == status, response.text
    assert response.headers["content-type"].startswith("application/json")
    body = response.json()
    assert set(body) == ERROR_KEYS
    assert body["error"] == code
    assert isinstance(body["message"], str) and body["message"]
    assert isinstance(body["details"], list)
    for detail in body["details"]:
        assert set(detail) == {"field", "issue"}
    return body


class _ExclusionViolation(Exception):
    """Stands in for a driver error whose SQLSTATE the handler does not map specifically."""

    sqlstate = "23P01"


class _RestrictViolation(Exception):
    """Stands in for PostgreSQL 18's restrict_violation, raised by a blocked ON DELETE RESTRICT."""

    sqlstate = "23001"


def _raise_restrict_violation() -> None:
    """Endpoint raising the IntegrityError that deleting a still-referenced row gives on PostgreSQL 18."""
    raise IntegrityError("DELETE FROM departments ...", {}, _RestrictViolation("still referenced"))


def _run_sql(statement: str) -> Callable[..., None]:
    """Build an endpoint that runs one SQL statement expected to break a constraint."""

    def endpoint(db: Session = Depends(get_db)) -> None:
        """Run the statement in the request's session."""
        db.execute(text(statement))

    return endpoint


def _raise_unmapped_integrity_error() -> None:
    """Endpoint raising an IntegrityError with an SQLSTATE that has no specific mapping."""
    raise IntegrityError(
        "INSERT INTO bookings ...", {}, _ExclusionViolation("conflicting key value")
    )


def _raise_unexpected() -> None:
    """Endpoint failing with an error nobody anticipated."""
    raise RuntimeError(SECRET_DETAIL)


# Test-only routes that break one database constraint each.
_FAILING_SQL = {
    "/_test/unique": "INSERT INTO departments (name) VALUES ('Dup'), ('dup')",
    "/_test/foreign-key": (
        "INSERT INTO users (name, email, password_hash, department_id) "
        "VALUES ('X', 'x@test.example', 'h', 999999)"
    ),
    "/_test/not-null": "INSERT INTO departments (name) VALUES (NULL)",
    "/_test/check": (
        "INSERT INTO users (name, email, password_hash, role) "
        "VALUES ('X', 'x@test.example', 'h', 'BOSS')"
    ),
    # Not a constraint: PostgreSQL raises numeric_value_out_of_range (22003), a DataError.
    "/_test/out-of-range": "SELECT CAST('99999999999999999999' AS BIGINT)",
}


@pytest.fixture
def failing_client(clean_db: Engine) -> Iterator[TestClient]:
    """The real app plus test-only routes that fail in specific ways."""
    app = create_app()
    for path, statement in _FAILING_SQL.items():
        app.add_api_route(path, _run_sql(statement), methods=["POST"])
    app.add_api_route("/_test/unmapped", _raise_unmapped_integrity_error, methods=["POST"])
    app.add_api_route("/_test/restrict", _raise_restrict_violation, methods=["POST"])
    app.add_api_route("/_test/boom", _raise_unexpected, methods=["GET"])
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("path", "status", "code"),
    [
        ("/_test/unique", 409, "CONFLICT"),
        ("/_test/foreign-key", 400, "INVALID_REFERENCE"),
        ("/_test/not-null", 400, "VALIDATION_ERROR"),
        ("/_test/check", 400, "VALIDATION_ERROR"),
        ("/_test/unmapped", 409, "CONFLICT"),
        ("/_test/restrict", 409, "CONFLICT"),
    ],
)
def test_integrity_errors_are_mapped(
    failing_client: TestClient, path: str, status: int, code: str
) -> None:
    """Constraint violations (23505, 23503, 23502, 23514) and an unmapped one get clean errors."""
    body = assert_error(failing_client.post(path), status, code)
    assert "INSERT" not in body["message"] and "violates" not in body["message"]


def test_integrity_error_rolls_back(failing_client: TestClient, db_session: Session) -> None:
    """The failed statement leaves nothing behind and the next request works."""
    assert failing_client.post("/_test/unique").status_code == 409
    assert db_session.execute(text("SELECT count(*) FROM departments")).scalar_one() == 0
    assert failing_client.get("/health").status_code == 200


def test_database_data_error_is_400_without_internals(
    failing_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    """A value PostgreSQL rejects (here out of BIGINT range) is 400 VALIDATION_ERROR, logged as a warning."""
    with caplog.at_level(logging.WARNING, logger="app.errors"):
        response = failing_client.post("/_test/out-of-range")
    body = assert_error(response, 400, "VALIDATION_ERROR")
    assert "BIGINT" not in body["message"] and "99999" not in response.text
    assert [record for record in caplog.records if record.levelno == logging.WARNING and "Rejected" in record.getMessage()]


def test_restrict_violation_is_a_known_conflict(
    failing_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    """PostgreSQL 18's 23001 gets its own 409 message and is not logged as an unmapped error."""
    with caplog.at_level(logging.ERROR, logger="app.errors"):
        body = assert_error(failing_client.post("/_test/restrict"), 409, "CONFLICT")
    assert body["message"] == "The record is still in use and cannot be deleted."
    assert not [record for record in caplog.records if "Unmapped" in record.getMessage()]


def test_unexpected_exception_is_a_generic_500_without_internals(
    failing_client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    """An unhandled error is logged with its traceback but the client sees only INTERNAL_ERROR."""
    with caplog.at_level(logging.ERROR, logger="app.errors"):
        response = failing_client.get("/_test/boom")
    body = assert_error(response, 500, "INTERNAL_ERROR")
    assert body == {
        "error": "INTERNAL_ERROR",
        "message": "An unexpected error occurred.",
        "details": [],
    }
    for leak in (SECRET_DETAIL, "Traceback", "RuntimeError", "File \""):
        assert leak not in response.text
    logged = [
        record for record in caplog.records if record.name == "app.errors" and record.exc_info
    ]
    assert logged and SECRET_DETAIL in str(logged[0].exc_info[1])


def test_unknown_route_is_404_in_the_standard_shape(client: TestClient) -> None:
    """Unknown paths, with or without a token or prefix-like segments, are 404 NOT_FOUND."""
    for path in ("/nope", "/users/1/unknown", "/api/portfolio-x/health", "/auth"):
        body = assert_error(client.get(path), 404, "NOT_FOUND")
        assert body["message"] == "Route not found."


def test_trailing_slashes_are_not_redirected(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """redirect_slashes is off: /users/ is a 404, never a 307 to /users."""
    headers = {"Authorization": f"Bearer {create_access_token(make_user('ADMIN'))}"}
    response = client.get("/users/", headers=headers, follow_redirects=False)
    assert_error(response, 404, "NOT_FOUND")


def test_wrong_method_is_405_in_the_standard_shape(client: TestClient) -> None:
    """A known path with an unsupported method is 405 METHOD_NOT_ALLOWED."""
    assert_error(client.patch("/departments"), 405, "METHOD_NOT_ALLOWED")
    assert_error(client.post("/auth/me"), 405, "METHOD_NOT_ALLOWED")


@pytest.mark.parametrize(
    ("content", "content_type"),
    [
        (b'{"email": "a@b.example", "password": ', "application/json"),
        (b"not json at all", "application/json"),
        (b'["a@b.example", "password"]', "application/json"),
        (b'"just a string"', "application/json"),
        (b"email=a@b.example&password=x", "application/x-www-form-urlencoded"),
    ],
)
def test_malformed_bodies_are_400(client: TestClient, content: bytes, content_type: str) -> None:
    """Broken JSON, non-object JSON and non-JSON bodies are 400 VALIDATION_ERROR, not 422/500."""
    response = client.post("/auth/login", content=content, headers={"content-type": content_type})
    assert_error(response, 400, "VALIDATION_ERROR")


def test_malformed_json_names_the_body_not_a_character_position(client: TestClient) -> None:
    """A JSON syntax error is reported on the request body, not on a character offset."""
    response = client.post(
        "/auth/login",
        content=b'{"email": "a@b.example", "password": ',
        headers={"content-type": "application/json"},
    )
    body = assert_error(response, 400, "VALIDATION_ERROR")
    fields = [detail["field"] for detail in body["details"]]
    assert fields and not any(field.isdigit() for field in fields), fields


def test_request_validation_is_400_not_422(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    """Body, query and path validation failures become 400 with field names, not FastAPI's 422."""
    headers = {"Authorization": f"Bearer {create_access_token(make_user('ADMIN'))}"}
    response = client.post("/auth/register", json={"email": "x"})
    body = assert_error(response, 400, "VALIDATION_ERROR")
    assert body["message"] == "The request is not valid."
    assert sorted(detail["field"] for detail in body["details"]) == ["email", "name", "password"]
    response = client.get("/users", params={"limit": 500}, headers=headers)
    assert assert_error(response, 400, "VALIDATION_ERROR")["details"][0]["field"] == "limit"
    response = client.get("/departments/abc", headers=headers)
    path = assert_error(response, 400, "VALIDATION_ERROR")
    assert path["details"][0]["field"] == "department_id"


@pytest.fixture
def role_headers(make_user: Callable[..., User]) -> Callable[[str], dict[str, str]]:
    """Factory for Authorization headers of a new user with a role."""

    def _headers(role: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(make_user(role))}"}

    return _headers


def test_every_error_status_uses_one_shape(
    failing_client: TestClient, role_headers: Callable[[str], dict[str, str]]
) -> None:
    """400, 401, 403, 404, 405, 409 and 500 responses all carry exactly error, message, details."""
    admin = role_headers("ADMIN")
    viewer = role_headers("VIEWER")
    client = failing_client
    created = client.post("/departments", json={"name": "Taken"}, headers=admin)
    assert created.status_code == 201
    unknown_department = {
        "name": "N",
        "email": "n@test.example",
        "password": "password1",
        "role": "VIEWER",
        "department_id": 777,
    }
    wrong_login = {"email": "x@test.example", "password": "password1"}
    cases = [
        (client.post("/departments", json={"name": ""}, headers=admin), 400, "VALIDATION_ERROR"),
        (client.post("/users", json=unknown_department, headers=admin), 400, "INVALID_REFERENCE"),
        (client.get("/users"), 401, "UNAUTHENTICATED"),
        (client.post("/auth/login", json=wrong_login), 401, "UNAUTHENTICATED"),
        (client.post("/departments", json={"name": "Ops"}, headers=viewer), 403, "ACCESS_DENIED"),
        (client.get("/departments/424242", headers=viewer), 404, "NOT_FOUND"),
        (client.get("/no-such-route"), 404, "NOT_FOUND"),
        (client.put("/auth/login"), 405, "METHOD_NOT_ALLOWED"),
        (client.post("/departments", json={"name": "TAKEN"}, headers=admin), 409, "CONFLICT"),
        (client.get("/_test/boom"), 500, "INTERNAL_ERROR"),
    ]
    for response, status, code in cases:
        assert_error(response, status, code)
