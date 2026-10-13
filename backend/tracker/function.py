"""
Project Tracker API - AWS Lambda entry point.

All endpoints live under ``/api/tracker`` and are dispatched by a small
router to feature modules in ``app/routes``. Every request:

1. ensures the schema exists (once per warm container),
2. authenticates the bearer token (except public auth routes),
3. runs the route inside a single database transaction,
4. returns JSON with a consistent error shape.
"""

import json
import logging
import time
from typing import Any

from psycopg import errors as pg_errors

from app import routes  # noqa: F401 - registers routes
from app.db import fetch_one, get_connection, reset_connection, transaction
from app.errors import ApiError, AuthenticationError
from app.http import Request, json_response
from app.router import Context, router
from app.schema import ensure_schema
from app.security import decode_token

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _authenticate(ctx: Context) -> None:
    """Resolve the bearer token to an active user and attach it to the context."""
    token = ctx.request.bearer_token()
    if not token:
        raise AuthenticationError("Sign in to continue.")
    user_id = decode_token(token, "access")
    user = fetch_one(ctx.conn, "SELECT * FROM users WHERE id = %s AND archived_at IS NULL", (user_id,))
    if user is None:
        raise AuthenticationError("Your account is no longer active.")
    ctx.user = user


def handle(request: Request) -> dict:
    """Dispatch a parsed request and translate errors into HTTP responses."""
    if request.method == "OPTIONS":
        return json_response(204)
    if request.path in ("/", "/health"):
        return json_response(200, {"status": "ok", "service": "tracker"})
    try:
        route, params = router.resolve(request.method, request.path)
        request.path_params = params
        ensure_schema(get_connection())
        with transaction() as conn:
            ctx = Context(conn=conn, request=request)
            if not route.public:
                _authenticate(ctx)
            status, body = route.handler(ctx)
        return json_response(status, body)
    except ApiError as exc:
        return json_response(exc.status, exc.to_dict())
    except pg_errors.UniqueViolation:
        return json_response(409, {"error": {"code": "conflict", "message": "That record already exists."}})
    except (pg_errors.CheckViolation, pg_errors.ForeignKeyViolation,
            pg_errors.InvalidTextRepresentation, pg_errors.NumericValueOutOfRange) as exc:
        logger.warning("Constraint violation: %s", exc)
        return json_response(400, {"error": {"code": "validation_error",
                                             "message": "The request violates a data constraint."}})
    except pg_errors.OperationalError:
        logger.exception("Database unavailable")
        reset_connection()
        return json_response(503, {"error": {"code": "database_unavailable",
                                             "message": "The database is temporarily unavailable. Please retry."}})
    except Exception:  # pylint: disable=broad-except
        logger.exception("Unhandled error for %s %s", request.method, request.path)
        return json_response(500, {"error": {"code": "internal_error",
                                             "message": "Something went wrong. Please try again."}})


def handler(event: dict | None = None, context: Any = None) -> dict:
    """AWS Lambda handler for Function URL / API Gateway events."""
    started = time.perf_counter()
    request = Request.from_event(event or {})
    response = handle(request)
    logger.info(json.dumps({
        "method": request.method,
        "path": request.path,
        "status": response["statusCode"],
        "ms": round((time.perf_counter() - started) * 1000, 1),
    }))
    return response


if __name__ == "__main__":
    print(handler({"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}))
