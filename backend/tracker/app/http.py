"""
Lambda Function URL event parsing and JSON response helpers.
"""

import base64
import json
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from . import config
from .errors import ValidationError

CORS_HEADERS = {
    "Content-Type": "application/json",
}


def _json_default(value: Any) -> Any:
    """Serialize dates and decimals that psycopg returns."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Unserializable type: {type(value).__name__}")


def json_response(status: int, body: Any = None) -> dict:
    """Build a Lambda Function URL response with a JSON body."""
    response: dict[str, Any] = {"statusCode": status, "headers": dict(CORS_HEADERS)}
    if body is not None and status != 204:
        response["body"] = json.dumps(body, default=_json_default)
    else:
        response["body"] = ""
    return response


def normalize_path(raw_path: str) -> str:
    """
    Strip the CloudFront ``/api/tracker`` prefix and trailing slashes.

    Locally the CORS proxy already strips the prefix; in AWS CloudFront forwards
    the full path, so both forms must resolve to the same route.
    """
    path = raw_path or "/"
    if path.startswith(config.PATH_PREFIX):
        path = path[len(config.PATH_PREFIX):]
    path = "/" + path.strip("/")
    return path


@dataclass
class Request:
    """A parsed HTTP request independent of the Lambda event shape."""

    method: str
    path: str
    query: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    raw_body: Optional[str] = None
    path_params: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_event(cls, event: dict) -> "Request":
        """Parse a Lambda Function URL (payload v2) or API Gateway v1 event."""
        ctx_http = (event.get("requestContext") or {}).get("http") or {}
        method = (ctx_http.get("method") or event.get("httpMethod") or "GET").upper()
        raw_path = event.get("rawPath") or event.get("path") or "/"
        headers = {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}
        body = event.get("body")
        if body and event.get("isBase64Encoded"):
            body = base64.b64decode(body).decode("utf-8")
        return cls(
            method=method,
            path=normalize_path(raw_path),
            query={k: v for k, v in (event.get("queryStringParameters") or {}).items() if v is not None},
            headers=headers,
            raw_body=body,
        )

    def json(self) -> dict:
        """Return the JSON body as a dict, rejecting malformed or non-object payloads."""
        if not self.raw_body:
            return {}
        try:
            data = json.loads(self.raw_body)
        except json.JSONDecodeError as exc:
            raise ValidationError("Request body must be valid JSON.") from exc
        if not isinstance(data, dict):
            raise ValidationError("Request body must be a JSON object.")
        return data

    def bearer_token(self) -> Optional[str]:
        """Extract a bearer token from the Authorization header."""
        value = self.headers.get("authorization", "")
        if value.lower().startswith("bearer "):
            return value[7:].strip() or None
        return None
