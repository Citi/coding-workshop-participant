"""Application errors and the handlers that render one JSON error shape.

Every error response looks like::

    {"error": "VALIDATION_ERROR", "message": "Human-readable summary",
     "details": [{"field": "email", "issue": "..."}]}
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DataError, IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

# Parts of a Pydantic error location that name the request section, not the field.
_LOCATION_PREFIXES = {"body", "query", "path", "header", "cookie"}

# HTTP status code -> error code for errors raised by Starlette/FastAPI itself.
_HTTP_STATUS_CODES = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHENTICATED",
    403: "ACCESS_DENIED",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
}


class AppError(Exception):
    """Base class for errors that map directly onto an API error response."""

    status_code: int = 500
    error: str = "INTERNAL_ERROR"

    def __init__(self, message: str, details: list[dict[str, Any]] | None = None) -> None:
        """Store the human-readable message and optional per-field details."""
        super().__init__(message)
        self.message = message
        self.details = details or []


class ValidationFailed(AppError):
    """The request is well-formed JSON but breaks a validation rule (400)."""

    status_code = 400
    error = "VALIDATION_ERROR"


class InvalidReference(AppError):
    """The request references a record that does not exist (400)."""

    status_code = 400
    error = "INVALID_REFERENCE"


class DependencyCycle(AppError):
    """Adding the dependency would create a cycle (400)."""

    status_code = 400
    error = "DEPENDENCY_CYCLE"


class Unauthenticated(AppError):
    """The token is missing, invalid or expired (401)."""

    status_code = 401
    error = "UNAUTHENTICATED"


class AccessDenied(AppError):
    """The caller's role is not allowed to perform the action (403)."""

    status_code = 403
    error = "ACCESS_DENIED"


class NotFound(AppError):
    """The record or route does not exist (404)."""

    status_code = 404
    error = "NOT_FOUND"


class Conflict(AppError):
    """The change conflicts with existing data, such as a duplicate (409)."""

    status_code = 409
    error = "CONFLICT"


def error_body(error: str, message: str, details: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Build the standard error payload."""
    return {"error": error, "message": message, "details": details or []}


def error_response(
    status_code: int, error: str, message: str, details: list[dict[str, Any]] | None = None
) -> JSONResponse:
    """Build a JSON response carrying the standard error payload."""
    return JSONResponse(status_code=status_code, content=error_body(error, message, details))


def _field_name(error: dict[str, Any]) -> str:
    """Turn a Pydantic error location into a dotted field name.

    A malformed JSON body is reported against ``body``, not the character position
    that FastAPI puts in its location.
    """
    if error.get("type") == "json_invalid":
        return "body"
    parts = [str(part) for part in error.get("loc", ()) if str(part) not in _LOCATION_PREFIXES]
    return ".".join(parts) or "request"


async def _handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Render request validation failures as 400 instead of FastAPI's 422."""
    details = [{"field": _field_name(err), "issue": err.get("msg", "Invalid value")} for err in exc.errors()]
    return error_response(400, "VALIDATION_ERROR", "The request is not valid.", details)


async def _handle_http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Render Starlette/FastAPI HTTP errors (unknown routes, bad methods) in the standard shape."""
    code = _HTTP_STATUS_CODES.get(exc.status_code, "INTERNAL_ERROR" if exc.status_code >= 500 else "HTTP_ERROR")
    message = "Route not found." if exc.status_code == 404 else str(exc.detail)
    response = error_response(exc.status_code, code, message)
    if exc.headers:
        response.headers.update(exc.headers)
    return response


async def _handle_app_error(_: Request, exc: AppError) -> JSONResponse:
    """Render application errors with their own status and code."""
    return error_response(exc.status_code, exc.error, exc.message, exc.details)


async def _handle_integrity(_: Request, exc: IntegrityError) -> JSONResponse:
    """Map database constraint violations that services did not pre-check."""
    sqlstate = getattr(exc.orig, "sqlstate", None)
    if sqlstate == "23505":
        return error_response(409, "CONFLICT", "A record with the same unique value already exists.")
    if sqlstate == "23503":
        return error_response(400, "INVALID_REFERENCE", "A referenced record does not exist or is still in use.")
    if sqlstate == "23001":
        # PostgreSQL 18 reports a blocked ON DELETE RESTRICT as restrict_violation, not 23503.
        return error_response(409, "CONFLICT", "The record is still in use and cannot be deleted.")
    if sqlstate in {"23502", "23514"}:
        return error_response(400, "VALIDATION_ERROR", "The data breaks a database constraint.")
    logger.error("Unmapped integrity error: %s", exc.orig)
    return error_response(409, "CONFLICT", "The change conflicts with existing data.")


async def _handle_data_error(_: Request, exc: DataError) -> JSONResponse:
    """Reject values the database cannot store or compare (NUL bytes, numbers out of range) as 400."""
    logger.warning("Rejected a value the database cannot handle: %s", type(exc.orig).__name__)
    return error_response(
        400,
        "VALIDATION_ERROR",
        "A value cannot be stored or searched: it is out of range or contains a disallowed character.",
    )


async def _handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
    """Log anything unexpected and return a generic 500 without leaking internals."""
    logger.exception("Unhandled error: %s", exc)
    return error_response(500, "INTERNAL_ERROR", "An unexpected error occurred.")


def register_error_handlers(app: FastAPI) -> None:
    """Attach every error handler to the application."""
    app.add_exception_handler(RequestValidationError, _handle_validation)
    app.add_exception_handler(StarletteHTTPException, _handle_http)
    app.add_exception_handler(AppError, _handle_app_error)
    app.add_exception_handler(IntegrityError, _handle_integrity)
    app.add_exception_handler(DataError, _handle_data_error)
    app.add_exception_handler(Exception, _handle_unexpected)
