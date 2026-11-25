"""Application wiring: builds the router and turns Lambda events into HTTP responses.

Request lifecycle (``handle``):
    parse event -> resolve route (404/405) -> open DB transaction (a connection the server closed
    while the container was idle is replaced, once) -> authenticate (401) -> check role permission (403)
    -> run handler -> commit (or roll back on any error) -> JSON response with a consistent error shape.
"""

import json
import logging
import time
from contextlib import ExitStack

import psycopg
from psycopg import errors as pg_errors

from app.allocations import routes as allocations_routes
from app.auth import routes as auth_routes
from app.auth.middleware import authenticate, require_permission
from app.core import db
from app.core.errors import ApiError, ConflictError, ValidationError
from app.core.http import Response, parse_event, to_lambda_response
from app.core.router import Router
from app.dashboard import routes as dashboard_routes
from app.deliverables import routes as deliverables_routes
from app.expenses import routes as expenses_routes
from app.projects import routes as projects_routes
from app.resources import routes as resources_routes
from app.users import routes as users_routes

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DOMAIN_ROUTES = (
    auth_routes,
    users_routes,
    projects_routes,
    deliverables_routes,
    resources_routes,
    allocations_routes,
    expenses_routes,
    dashboard_routes,
)


# Unique indexes (schema.sql) -> the request field to blame. Services check uniqueness first with a
# friendly message; this covers two requests racing past that check at the same moment.
UNIQUE_CONSTRAINT_FIELDS = {
    "users_email_key": "email",
    "resources_email_key": "email",
    "projects_name_key": "name",
    "deliverables_project_name_key": "name",
    "allocations_resource_project_key": "resource_id",
}


def conflict_from(exc: pg_errors.UniqueViolation) -> ConflictError:
    """409 with ``details`` naming the duplicated field when the constraint is known."""
    field = UNIQUE_CONSTRAINT_FIELDS.get(getattr(exc.diag, "constraint_name", None) or "")
    return ConflictError(details={field: "Already exists"} if field else None)


def health(_req):
    """Liveness check that does not touch the database."""
    return {"status": "ok", "service": "pm-service"}


def health_db(req):
    """Public wake-up / readiness check: one round trip to the database.

    It runs through the normal pipeline, so on a cold start it also opens the connection and
    applies the schema bootstrap; a client can call it early so its first real request is fast.
    """
    req.conn.execute("SELECT 1")
    return {"status": "ok", "service": "pm-service", "database": "ok"}


def build_router() -> Router:
    router = Router()
    router.add("GET", "/", health, public=True, uses_db=False)
    router.add("GET", "/health", health, public=True, uses_db=False)
    router.add("GET", "/health/db", health_db, public=True, uses_db=True)
    for module in DOMAIN_ROUTES:
        module.register(router)
    return router


ROUTER = build_router()


def _as_response(result) -> Response:
    if isinstance(result, Response):
        return result
    if result is None:
        return Response(204)
    return Response(200, result)


def _dispatch(req) -> Response:
    route, params = ROUTER.resolve(req.method, req.path)
    req.path_params = params
    if not route.uses_db:
        return _as_response(route.handler(req))
    try:
        with ExitStack() as scope:  # holds the request's transaction: commit on success, roll back on error
            req.conn = _open_transaction(scope, req)
            if not route.public:
                req.user = authenticate(req)
                if route.permission:
                    require_permission(req.user, route.permission)
            result = route.handler(req)
        return _as_response(result)
    except ApiError:
        raise
    # Safety nets: services validate first, but the database is the final guard.
    except pg_errors.UniqueViolation as exc:
        raise conflict_from(exc) from exc
    except pg_errors.ForeignKeyViolation as exc:
        raise ValidationError("A referenced record does not exist") from exc
    except (pg_errors.CheckViolation, pg_errors.NotNullViolation, psycopg.DataError) as exc:
        raise ValidationError("The submitted data violates a data rule") from exc
    except psycopg.OperationalError as exc:
        logger.exception("Database connection problem")
        db.reset_connection()
        raise ApiError(
            "The database is currently unavailable, please try again shortly", code="DATABASE_UNAVAILABLE"
        ) from exc
    except psycopg.Error as exc:
        logger.exception("Database error")
        raise ApiError("A database error occurred", code="DATABASE_ERROR") from exc


def _open_transaction(scope: ExitStack, req) -> psycopg.Connection:
    """Get the container's connection, bootstrap the schema and open the request's transaction on ``scope``.

    A warm container's cached connection may have been closed by the server since the last request
    (Aurora Serverless pausing at 0 ACU, an idle timeout, a failover); psycopg only notices when it
    first uses it, here. Nothing of the request has run yet, so a lost connection is replaced and this
    step retried once (connecting waits while Aurora resumes). Nothing is retried after this point,
    since the handler may already have written; any other error, or a second failure, is reported as usual.
    """
    try:
        return _begin(scope)
    except psycopg.Error as exc:
        if not (isinstance(exc, psycopg.OperationalError) or db.connection_lost()):
            raise
        logger.warning(json.dumps({"event": "db_reconnect", "request_id": req.request_id, "error": type(exc).__name__}))
        db.reset_connection()
        return _begin(scope)


def _begin(scope: ExitStack) -> psycopg.Connection:
    conn = db.get_connection()
    db.ensure_schema(conn)
    scope.enter_context(conn.transaction())
    return conn


def handle(event: dict, context=None) -> dict:
    started = time.perf_counter()
    req = None
    try:
        req = parse_event(event)
        response = Response(204) if req.method == "OPTIONS" else _dispatch(req)
    except ApiError as exc:
        response = Response(exc.status, exc.to_dict())
    except Exception:  # noqa: BLE001 - last-resort guard: the client always gets JSON
        logger.exception("Unhandled error")
        response = Response(500, ApiError().to_dict())
    _log_request(req, response, started)
    return to_lambda_response(response)


def _log_request(req, response: Response, started: float) -> None:
    logger.info(
        json.dumps(
            {
                "request_id": getattr(req, "request_id", ""),
                "method": getattr(req, "method", None),
                "path": getattr(req, "path", None),
                "status": response.status,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                "user_id": (getattr(req, "user", None) or {}).get("id"),
            }
        )
    )
