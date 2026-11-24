"""Cross-cutting error handling: values the database rejects, pagination bounds, malformed JSON."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient


def _assert_error_shape(body: dict[str, Any], code: str) -> None:
    """Every error uses the standard {error, message, details} shape."""
    assert set(body) == {"error", "message", "details"}
    assert body["error"] == code
    assert isinstance(body["message"], str) and body["message"]
    assert isinstance(body["details"], list)


@pytest.mark.parametrize("path", ["/users", "/departments"])
def test_nul_character_in_search_is_400_not_500(
    client: TestClient, auth_headers: Callable[..., dict[str, str]], path: str
) -> None:
    """A NUL byte cannot be sent to PostgreSQL; it must be a validation error, never a 500."""
    response = client.get(path, params={"q": "a\x00b"}, headers=auth_headers("VIEWER"))
    assert response.status_code == 400
    _assert_error_shape(response.json(), "VALIDATION_ERROR")


def test_nul_character_in_login_email_is_rejected_without_500(client: TestClient) -> None:
    """The public login route must not crash on a NUL byte."""
    response = client.post("/auth/login", json={"email": "a\x00@acme.example", "password": "whatever-123"})
    assert response.status_code in {400, 401}
    assert response.json()["error"] in {"VALIDATION_ERROR", "UNAUTHENTICATED"}


def test_offset_beyond_database_range_is_400(client: TestClient, auth_headers: Callable[..., dict[str, str]]) -> None:
    """An offset larger than PostgreSQL accepts is rejected by validation."""
    response = client.get("/users", params={"offset": str(2**63)}, headers=auth_headers("VIEWER"))
    assert response.status_code == 400
    body = response.json()
    _assert_error_shape(body, "VALIDATION_ERROR")
    assert body["details"][0]["field"] == "offset"


def test_malformed_json_names_the_body_not_a_character_position(client: TestClient) -> None:
    """Broken JSON is reported against the body field."""
    response = client.post(
        "/auth/login", content=b'{"email": "x@acme.example", "password": ', headers={"content-type": "application/json"}
    )
    assert response.status_code == 400
    body = response.json()
    _assert_error_shape(body, "VALIDATION_ERROR")
    assert body["details"][0]["field"] == "body"
