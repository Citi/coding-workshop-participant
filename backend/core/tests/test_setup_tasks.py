"""The setup task that `aws lambda invoke` runs, and how function.handler routes to it."""

import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from function import handler

ADMIN = {"admin_email": "Boss@ACME.inc", "admin_password": "demo-password-1"}


def seed(**fields: Any) -> dict[str, Any]:
    """Invoke the Lambda handler the way the AWS CLI does."""
    return handler({"setup_task": "seed", **fields}, None)


def login(client: TestClient, api: str, email: str, password: str) -> int:
    """Return the status code of a login attempt."""
    response = client.post(f"{api}/auth/login", json={"email": email, "password": password})
    return response.status_code


def function_url_event(method: str, path: str) -> dict[str, Any]:
    """A minimal Lambda Function URL (payload v2) event, as a browser request arrives."""
    return {
        "version": "2.0",
        "routeKey": "$default",
        "rawPath": path,
        "rawQueryString": "",
        "headers": {"host": "example.lambda-url.us-east-1.on.aws"},
        "requestContext": {
            "http": {
                "method": method,
                "path": path,
                "protocol": "HTTP/1.1",
                "sourceIp": "203.0.113.1",
                "userAgent": "pytest",
            },
            "stage": "$default",
        },
        "isBase64Encoded": False,
    }


def test_seed_creates_admin_who_can_sign_in(
    client: TestClient, api: str, run_sql: Callable[..., list[dict[str, Any]]]
) -> None:
    """The admin is stored with a lowercased email and the admin role, and can log in."""
    result = seed(**ADMIN)

    assert result == {
        "ok": True,
        "task": "seed",
        "sql_files": ["schema.sql", "seed.sql"],
        "admin": {"email": "boss@acme.inc", "created": True},
    }
    rows = run_sql(
        "SELECT u.full_name, r.role_name FROM users u JOIN roles r USING (role_id) "
        "WHERE u.email = 'boss@acme.inc'"
    )
    assert rows == [{"full_name": "Facility Admin", "role_name": "admin"}]
    response = client.post(
        f"{api}/auth/login",
        json={"email": "boss@acme.inc", "password": "demo-password-1"},
    )
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"


def test_seed_uses_admin_name_when_given(run_sql: Callable[..., list[dict[str, Any]]]) -> None:
    """admin_name overrides the default display name."""
    seed(**ADMIN, admin_name="  Dana Boss ")

    rows = run_sql("SELECT full_name FROM users WHERE email = 'boss@acme.inc'")
    assert rows == [{"full_name": "Dana Boss"}]


def test_seed_twice_leaves_existing_admin_alone(client: TestClient, api: str) -> None:
    """A second run with another password neither fails nor changes the password."""
    seed(**ADMIN)

    result = seed(admin_email="boss@acme.inc", admin_password="another-password")

    assert result["ok"] is True
    assert result["admin"] == {"email": "boss@acme.inc", "created": False}
    assert login(client, api, "boss@acme.inc", "demo-password-1") == 200
    assert login(client, api, "boss@acme.inc", "another-password") == 401


def test_seed_never_promotes_an_existing_account(
    register: Callable[..., dict[str, Any]], run_sql: Callable[..., list[dict[str, Any]]]
) -> None:
    """Naming someone else's email doesn't turn their account into an admin."""
    register("boss@acme.inc", "Already Here")

    result = seed(**ADMIN)

    assert result["admin"]["created"] is False
    rows = run_sql(
        "SELECT r.role_name FROM users u JOIN roles r USING (role_id) "
        "WHERE u.email = 'boss@acme.inc'"
    )
    assert rows == [{"role_name": "employee"}]


def test_seed_without_admin_only_runs_sql(run_sql: Callable[..., list[dict[str, Any]]]) -> None:
    """Later runs can apply schema changes without passing a password again."""
    result = seed()

    assert result == {"ok": True, "task": "seed", "sql_files": ["schema.sql", "seed.sql"]}
    assert run_sql("SELECT count(*) AS n FROM users") == [{"n": 0}]
    assert run_sql("SELECT count(*) AS n FROM seats") == [{"n": 20}]


def test_seed_restores_missing_tables(run_sql: Callable[..., list[dict[str, Any]]]) -> None:
    """On an empty database (like a fresh Aurora) it builds the schema and the locations."""
    run_sql("DROP TABLE ticket_status_history")

    seed()

    assert run_sql("SELECT to_regclass('ticket_status_history') IS NOT NULL AS ok") == [
        {"ok": True}
    ]


@pytest.mark.parametrize(
    ("fields", "message"),
    [
        ({"admin_email": "boss@acme.inc"}, "admin_password is required"),
        ({"admin_email": "boss@gmail.com", "admin_password": "demo-password-1"}, "admin_email"),
        ({"admin_email": "boss@acme.inc", "admin_password": "short"}, "admin_password"),
    ],
)
def test_seed_rejects_bad_admin_without_touching_the_database(
    fields: dict[str, str], message: str, run_sql: Callable[..., list[dict[str, Any]]]
) -> None:
    """Invalid admin details return an error, and nothing is written."""
    run_sql("DELETE FROM seats")

    result = seed(**fields)

    assert result["ok"] is False
    assert message in result["error"]
    assert run_sql("SELECT count(*) AS n FROM seats") == [{"n": 0}]


def test_error_never_echoes_the_password() -> None:
    """A rejected password isn't copied into out.json or the logs."""
    result = seed(admin_email="boss@acme.inc", admin_password="secret1")

    assert result["ok"] is False
    assert "secret1" not in json.dumps(result)


def test_unknown_task_is_rejected() -> None:
    """Only 'seed' exists; anything else says so."""
    assert handler({"setup_task": "drop_everything"}, None) == {
        "ok": False,
        "error": "Unknown setup_task 'drop_everything'. Known tasks: 'seed'",
    }


def test_function_url_requests_still_reach_the_api() -> None:
    """A normal HTTP event goes through Mangum to FastAPI, not to the setup task."""
    response = handler(function_url_event("GET", "/api/core/health"), None)

    assert response["statusCode"] == 200
    assert json.loads(response["body"])["status"] == "ok"


def test_setup_task_in_a_request_body_is_just_an_api_call() -> None:
    """The public URL can't trigger setup: the key would be inside the body, not the event."""
    event = function_url_event("POST", "/api/core/auth/login")
    event["headers"]["content-type"] = "application/json"
    event["body"] = json.dumps({"setup_task": "seed", **ADMIN})

    response = handler(event, None)

    assert response["statusCode"] == 422
