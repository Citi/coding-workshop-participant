"""
Lambda response shapers.

Every endpoint in every service returns through this module, so success and
failure bodies have one shape no matter which service produced them. The
frontend's error handling keys off `message` and `fieldErrors`.
"""

import decimal
import json
import uuid
from datetime import date, datetime

CORS_HEADERS = {
    "Content-Type": "application/json",
    # The Lambda Function URL CORS config already covers the browser
    # preflight; these are here so direct curl/CloudFront calls behave the
    # same way, and so local LocalStack responses are consistent.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
}


class _Encoder(json.JSONEncoder):
    """Serialises the Postgres types psycopg2 hands back.

    UUIDs, dates and NUMERIC (decimal.Decimal) are not JSON-native. Decimals
    become floats only at the boundary -- the arithmetic itself stays exact in
    the database, which is what matters for money.
    """

    def default(self, o):
        if isinstance(o, uuid.UUID):
            return str(o)
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, decimal.Decimal):
            return float(o)
        return super().default(o)


def response(status_code, body=None, headers=None):
    """Base shaper. `body=None` produces a bodyless response (204)."""
    result = {
        "statusCode": status_code,
        "headers": {**CORS_HEADERS, **(headers or {})},
    }
    if body is not None:
        result["body"] = json.dumps(body, cls=_Encoder)
    return result


# -- Success ----------------------------------------------------------------


def ok(body):
    return response(200, body)


def created(body):
    return response(201, body)


def no_content():
    return response(204)


# -- Failure ----------------------------------------------------------------
#
# `code` is a stable machine-readable string; `message` is human-facing and is
# what the UI displays. Never put SQL text or stack traces in either.


def error(status_code, message, code="error", field_errors=None):
    body = {"error": code, "code": code, "message": message}
    if field_errors:
        body["fieldErrors"] = field_errors
    return response(status_code, body)


def bad_request(message="Invalid request", field_errors=None):
    return error(400, message, "bad_request", field_errors)


def unauthorized(message="Authentication required"):
    return error(401, message, "unauthorized")


def forbidden(message="You do not have permission to perform this action"):
    return error(403, message, "forbidden")


def not_found(message="Resource not found"):
    return error(404, message, "not_found")


def conflict(message="That conflicts with an existing record"):
    return error(409, message, "conflict")


def server_error(message="Internal server error"):
    return error(500, message, "server_error")
