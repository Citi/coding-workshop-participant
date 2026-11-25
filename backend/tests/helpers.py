"""Test helpers: call the real Lambda handler with Lambda Function URL (v2.0) events."""

import base64
import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import function  # pm-service/function.py (on pythonpath via pytest.ini)

DEFAULT_PASSWORDS = {
    "admin": ("admin@acme.com", "Admin@123"),
    "manager": ("manager@acme.com", "Manager@123"),
    "contributor": ("contributor@acme.com", "Contributor@123"),
    "viewer": ("viewer@acme.com", "Viewer@123"),
}


@dataclass
class ApiResult:
    status: int
    body: Any
    headers: dict
    raw: str


def make_event(method, path, *, body=None, raw_body=None, token=None, query=None, headers=None, base64_body=False):
    all_headers = {"content-type": "application/json"}
    if token:
        all_headers["authorization"] = f"Bearer {token}"
    all_headers.update(headers or {})
    if raw_body is None and body is not None:
        raw_body = json.dumps(body)
    is_base64 = False
    if base64_body and raw_body is not None:
        raw_body = base64.b64encode(raw_body.encode("utf-8")).decode("ascii")
        is_base64 = True
    query = {
        key: (str(value).lower() if isinstance(value, bool) else str(value)) for key, value in (query or {}).items()
    }
    return {
        "version": "2.0",
        "rawPath": path,
        "rawQueryString": urlencode(query),
        "queryStringParameters": query or None,
        "headers": all_headers,
        "body": raw_body,
        "isBase64Encoded": is_base64,
        "requestContext": {"http": {"method": method, "path": path}, "requestId": "pytest"},
    }


class ApiClient:
    """``api.get("/projects", token=t, query={"status": "active"})`` -> ApiResult."""

    def request(self, method, path, **kwargs) -> ApiResult:
        response = function.handler(make_event(method, path, **kwargs), None)
        raw = response.get("body") or ""
        return ApiResult(response["statusCode"], json.loads(raw) if raw else None, response.get("headers", {}), raw)

    def get(self, path, **kwargs):
        return self.request("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self.request("POST", path, **kwargs)

    def put(self, path, **kwargs):
        return self.request("PUT", path, **kwargs)

    def delete(self, path, **kwargs):
        return self.request("DELETE", path, **kwargs)

    def login(self, email, password) -> str:
        result = self.post("/auth/login", body={"email": email, "password": password})
        assert result.status == 200, result.body
        return result.body["access_token"]


def assert_error(result: ApiResult, status: int, code: str | None = None, field: str | None = None):
    """Assert the consistent error shape: {"error": {"code", "message", "details"?}}."""
    assert result.status == status, f"expected {status}, got {result.status}: {result.body}"
    assert isinstance(result.body, dict) and "error" in result.body, result.body
    error = result.body["error"]
    assert error.get("code") and error.get("message"), error
    if code:
        assert error["code"] == code, error
    if field:
        assert field in (error.get("details") or {}), error
    return error
