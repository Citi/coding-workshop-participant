"""Cross-cutting API behaviour: error shape, routing prefixes, Lambda entry point."""

import json

from fastapi.testclient import TestClient


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_cloudfront_prefix_is_stripped(client, as_):
    """CloudFront forwards /api/api-service/...; the dev proxy strips it first. Both work."""
    assert client.get("/api/api-service/health").status_code == 200
    r = client.get("/api/api-service/incidents", headers=as_("alice"))
    assert r.status_code == 200 and r.json()["total"] == 7


def test_unknown_route_uses_standard_error_shape(client):
    r = client.get("/nope")
    assert r.status_code == 404 and r.json() == {"message": "Not Found"}


def test_wrong_method_uses_standard_error_shape(client):
    r = client.put("/health")
    assert r.status_code == 405 and set(r.json()) == {"message"}


def test_validation_errors_list_every_field(client, as_):
    r = client.post("/incidents", headers=as_("emma"), json={})
    body = r.json()
    assert r.status_code == 422 and body["message"]
    assert {e["loc"][-1] for e in body["errors"]} == {"title", "description", "category", "building_id"}


def test_unexpected_errors_return_safe_500(seed_conn, as_, monkeypatch):
    from app.api.routes import dashboard
    from app.main import app

    def boom(*_):
        raise RuntimeError("database exploded")

    monkeypatch.setitem(dashboard._BUILDERS, "employee", boom)
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/dashboard", headers=as_("emma"))
    assert r.status_code == 500
    assert r.json() == {"message": "Something went wrong. Please try again."}  # no internals leaked


# ---------------------------------------------------------------- Lambda handler

def url_event(method, path, body=None, headers=None):
    """A Lambda Function URL (payload v2.0) event, as CloudFront/LocalStack send it."""
    return {
        "version": "2.0",
        "routeKey": "$default",
        "rawPath": path,
        "rawQueryString": "",
        "headers": {"content-type": "application/json", "host": "lambda.test", **(headers or {})},
        "requestContext": {
            "http": {"method": method, "path": path, "protocol": "HTTP/1.1", "sourceIp": "127.0.0.1", "userAgent": "pytest"},
            "requestId": "test", "stage": "$default", "domainName": "lambda.test", "timeEpoch": 0,
        },
        "body": json.dumps(body) if body is not None else None,
        "isBase64Encoded": False,
    }


class _Context:
    function_name = "coding-workshop-api-service-test"
    aws_request_id = "test"


def test_lambda_handler_end_to_end(seed_conn):
    from function import handler

    r = handler(url_event("GET", "/api/api-service/health"), _Context())
    assert r["statusCode"] == 200 and json.loads(r["body"]) == {"status": "ok"}

    r = handler(url_event("POST", "/api/api-service/auth/login",
                          {"email": "emma@acme.inc", "password": "Password123!"}), _Context())
    assert r["statusCode"] == 200
    token = json.loads(r["body"])["token"]

    r = handler(url_event("GET", "/incidents", headers={"authorization": f"Bearer {token}"}), _Context())
    assert r["statusCode"] == 200 and json.loads(r["body"])["total"] == 2

    r = handler(url_event("GET", "/incidents"), _Context())
    assert r["statusCode"] == 401 and json.loads(r["body"]) == {"message": "Please sign in."}


import pytest
from sqlalchemy.exc import OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeout


@pytest.mark.parametrize("error, message", [
    (PoolTimeout("QueuePool limit reached"), "The service is busy right now. Please try again in a moment."),
    (OperationalError("SELECT 1", {}, Exception("connection refused")),
     "The database is unavailable right now. Please try again shortly."),
])
def test_database_trouble_returns_503_with_retry_hint(seed_conn, as_, monkeypatch, error, message):
    from app.api.routes import dashboard
    from app.main import app

    def fail(*_):
        raise error

    monkeypatch.setitem(dashboard._BUILDERS, "employee", fail)
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/dashboard", headers=as_("emma"))
    assert r.status_code == 503
    assert r.json() == {"message": message}
    assert r.headers["retry-after"]
