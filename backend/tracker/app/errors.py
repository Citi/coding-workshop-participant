"""Typed API errors that map directly to HTTP status codes."""

from typing import Any, Optional


class ApiError(Exception):
    """Base error carrying an HTTP status, a machine code and optional field details."""

    status: int = 500
    code: str = "internal_error"

    def __init__(self, message: str, details: Optional[dict[str, Any]] = None) -> None:
        """Create the error with a human-readable message and optional field errors."""
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        """Serialize to the consistent error body used by every endpoint."""
        body: dict[str, Any] = {"error": {"code": self.code, "message": self.message}}
        if self.details:
            body["error"]["details"] = self.details
        return body


class ValidationError(ApiError):
    """400 - request body or query failed validation."""

    status = 400
    code = "validation_error"


class AuthenticationError(ApiError):
    """401 - missing, invalid or expired credentials."""

    status = 401
    code = "unauthorized"


class ForbiddenError(ApiError):
    """403 - authenticated but not allowed to perform the action."""

    status = 403
    code = "forbidden"


class NotFoundError(ApiError):
    """404 - resource does not exist or is not visible to the caller."""

    status = 404
    code = "not_found"


class ConflictError(ApiError):
    """409 - request conflicts with current state (duplicates, business rules)."""

    status = 409
    code = "conflict"
