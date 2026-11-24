"""HTTP primitives: Lambda event -> Request, Response -> Lambda Function URL result."""

import base64
import binascii
import json
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.core.errors import ValidationError

JSON_HEADERS = {"Content-Type": "application/json"}


@dataclass
class Request:
    """A parsed API request. ``conn`` and ``user`` are filled in by the dispatcher."""

    method: str
    path: str
    query: dict = field(default_factory=dict)
    headers: dict = field(default_factory=dict)
    body: str | None = None
    path_params: dict = field(default_factory=dict)
    request_id: str = ""
    user: dict | None = None
    conn: Any = None

    def json(self) -> Any:
        """Decode the JSON body; ``None`` when the body is empty, 400 INVALID_JSON when malformed."""
        if self.body is None or not str(self.body).strip():
            return None
        try:
            return json.loads(self.body)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            raise ValidationError("Request body must be valid JSON", code="INVALID_JSON") from exc


@dataclass
class Response:
    """An API response before it is serialised for Lambda."""

    status: int = 200
    body: Any = None
    headers: dict = field(default_factory=dict)


def ok(body: Any) -> Response:
    return Response(200, body)


def created(body: Any) -> Response:
    return Response(201, body)


def no_content() -> Response:
    return Response(204)


def list_result(items: list) -> dict:
    """The list envelope every collection endpoint returns (docs/API.md): {"items": [...], "total": n}."""
    return {"items": items, "total": len(items)}


def json_default(value: Any) -> Any:
    """JSON encoder for database types: dates as ISO strings, Decimals as numbers."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def to_lambda_response(response: Response) -> dict:
    body = ""
    if response.body is not None and response.status != 204:
        body = json.dumps(response.body, default=json_default)
    return {
        "statusCode": response.status,
        "headers": {**JSON_HEADERS, **response.headers},
        "body": body,
    }


def normalize_path(raw_path: str) -> str:
    """Collapse duplicate slashes and drop the ``/api/<service>`` prefix.

    In AWS, CloudFront forwards ``/api/pm-service/projects`` unchanged; locally the
    dev proxy strips the prefix and forwards ``/projects``. Both end up as ``/projects``.
    """
    segments = [segment for segment in (raw_path or "/").split("/") if segment]
    if len(segments) >= 2 and segments[0] == "api":
        segments = segments[2:]
    return "/" + "/".join(segments)


def parse_event(event: dict) -> Request:
    """Build a Request from a Lambda Function URL (payload v2.0) event."""
    context = event.get("requestContext") or {}
    method = ((context.get("http") or {}).get("method") or event.get("httpMethod") or "GET").upper()
    raw_path = event.get("rawPath") or event.get("path") or "/"
    headers = {str(key).lower(): value for key, value in (event.get("headers") or {}).items()}
    query = {key: value for key, value in (event.get("queryStringParameters") or {}).items() if value is not None}

    body = event.get("body")
    if body is not None and event.get("isBase64Encoded"):
        try:
            body = base64.b64decode(body).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
            raise ValidationError("Request body could not be decoded", code="INVALID_JSON") from exc

    return Request(
        method=method,
        path=normalize_path(raw_path),
        query=query,
        headers=headers,
        body=body,
        request_id=str(context.get("requestId") or ""),
    )
