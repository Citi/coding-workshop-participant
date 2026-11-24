"""Authentication and authorization checks run by the dispatcher before every protected route."""

from app.auth import repository
from app.auth.permissions import has_permission
from app.auth.tokens import ACCESS, decode_token
from app.core.errors import ForbiddenError, UnauthorizedError


def authenticate(req) -> dict:
    """Resolve the Bearer token to the current user (re-read from the database each request,
    so role changes and deactivations take effect immediately)."""
    header = (req.headers.get("authorization") or "").strip()
    if not header:
        raise UnauthorizedError("Authentication required", code="AUTH_REQUIRED")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise UnauthorizedError("Authorization header must be 'Bearer <token>'", code="INVALID_TOKEN")
    payload = decode_token(token.strip(), ACCESS)
    user = repository.find_by_id(req.conn, int(payload["sub"]))
    if user is None:
        raise UnauthorizedError("Invalid authentication token", code="INVALID_TOKEN")
    if not user["is_active"]:
        raise UnauthorizedError("This account has been disabled", code="ACCOUNT_DISABLED")
    return user


def require_permission(user: dict, permission: str) -> None:
    if not has_permission(user["role"], permission):
        raise ForbiddenError(
            f"Your role ({user['role']}) is not allowed to perform this action",
            details={"required_permission": permission},
        )
