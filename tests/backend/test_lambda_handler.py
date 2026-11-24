"""The Lambda entry point routes Function URL events to FastAPI and task events to run_task."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import pytest

import function


@pytest.mark.parametrize("path", ["/api/portfolio/health", "/health"])
def test_function_url_health_with_and_without_prefix(
    clean_db: Any, function_url_event: Callable[..., dict[str, Any]], path: str
) -> None:
    """CloudFront keeps the /api/portfolio prefix and the local proxy strips it; both must work."""
    response = function.handler(function_url_event("GET", path), None)
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["status"] == "healthy"
    assert body["database"] == "up"


def test_unknown_route_returns_standard_404(function_url_event: Callable[..., dict[str, Any]]) -> None:
    """Unknown routes use the standard error shape."""
    response = function.handler(function_url_event("GET", "/api/portfolio/does-not-exist"), None)
    assert response["statusCode"] == 404
    assert json.loads(response["body"])["error"] == "NOT_FOUND"


def test_task_event_dispatches_to_run_task(monkeypatch: pytest.MonkeyPatch) -> None:
    """A direct-invoke event with a top-level task key goes to run_task, not FastAPI."""
    calls: list[dict[str, Any]] = []

    def fake_run_task(event: dict[str, Any]) -> dict[str, Any]:
        calls.append(event)
        return {"status": "ok"}

    monkeypatch.setattr(function, "run_task", fake_run_task)
    assert function.handler({"task": "migrate"}, None) == {"status": "ok"}
    assert calls == [{"task": "migrate"}]


def test_event_with_request_context_is_never_a_task(
    monkeypatch: pytest.MonkeyPatch, function_url_event: Callable[..., dict[str, Any]]
) -> None:
    """An HTTP event can never reach run_task, even if it carries a task key."""
    monkeypatch.setattr(function, "run_task", lambda event: pytest.fail("run_task must not be called"))
    event = function_url_event("GET", "/health")
    event["task"] = "reset"
    response = function.handler(event, None)
    assert response["statusCode"] == 200
