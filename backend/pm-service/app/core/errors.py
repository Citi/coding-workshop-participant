"""API error types. Every error is rendered with the same JSON shape:

{"error": {"code": "VALIDATION_ERROR", "message": "...", "details": {"field": "message"}}}
"""


class ApiError(Exception):
    """Base error: carries an HTTP status, a machine-readable code and a user-facing message."""

    status = 500
    code = "INTERNAL_ERROR"
    default_message = "An unexpected error occurred"

    def __init__(self, message=None, *, details=None, code=None, status=None):
        self.message = message or self.default_message
        self.details = details
        if code:
            self.code = code
        if status:
            self.status = status
        super().__init__(self.message)

    def to_dict(self) -> dict:
        error = {"code": self.code, "message": self.message}
        if self.details:
            error["details"] = self.details
        return {"error": error}


class ValidationError(ApiError):
    """400 - the request body, query string or path parameter is invalid."""

    status = 400
    code = "VALIDATION_ERROR"
    default_message = "Validation failed"


class InvalidOperationError(ApiError):
    """400 - the request is well-formed but breaks a business rule (e.g. deleting yourself)."""

    status = 400
    code = "INVALID_OPERATION"
    default_message = "This operation is not allowed"


class UnauthorizedError(ApiError):
    """401 - missing, invalid or expired credentials."""

    status = 401
    code = "AUTH_REQUIRED"
    default_message = "Authentication required"


class ForbiddenError(ApiError):
    """403 - authenticated, but the role does not allow this action."""

    status = 403
    code = "FORBIDDEN"
    default_message = "You do not have permission to perform this action"


class NotFoundError(ApiError):
    """404 - the route or the requested record does not exist."""

    status = 404
    code = "NOT_FOUND"
    default_message = "Resource not found"


class MethodNotAllowedError(ApiError):
    """405 - the path exists but not for this HTTP method."""

    status = 405
    code = "METHOD_NOT_ALLOWED"
    default_message = "Method not allowed"


class ConflictError(ApiError):
    """409 - a uniqueness rule would be broken (duplicate name, email, ...)."""

    status = 409
    code = "CONFLICT"
    default_message = "A record with the same unique value already exists"
