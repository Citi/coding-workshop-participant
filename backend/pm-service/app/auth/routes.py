"""Authentication endpoints: POST /auth/login, POST /auth/refresh, GET /auth/me."""

from app.auth import repository
from app.auth.passwords import hash_password, verify_password
from app.auth.permissions import permissions_for
from app.auth.schemas import LoginRequest, RefreshRequest
from app.auth.tokens import REFRESH, create_access_token, create_refresh_token, decode_token
from app.core.config import get_settings
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.http import ok
from app.core.validation import parse_body

_dummy_hash: str | None = None

# A one-line constant keeps the bandit suppression to this line: inside the response dict below, the
# suppression comment would cover every string literal in the dict, including any secret added later.
TOKEN_TYPE = "Bearer"  # nosec B105 # the OAuth 2 token type name, not a secret


def session_user(user: dict) -> dict:
    """The user as seen by the frontend, including the permission list for the UI."""
    return {
        "id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "role": user["role"],
        "is_active": user["is_active"],
        "permissions": permissions_for(user["role"]),
    }


def _token_response(user: dict) -> dict:
    return {
        "access_token": create_access_token(user),
        "refresh_token": create_refresh_token(user),
        "token_type": TOKEN_TYPE,
        "expires_in": get_settings().access_token_minutes * 60,
        "user": session_user(user),
    }


def _spend_equal_time(password: str) -> None:
    """Check against a dummy hash so unknown emails take as long as wrong passwords."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password("timing-equaliser-not-a-real-password-1")
    verify_password(password, _dummy_hash)


def login(req):
    data = parse_body(LoginRequest, req)
    user = repository.find_by_email_with_password(req.conn, data.email)
    if user is None:
        _spend_equal_time(data.password)
        raise UnauthorizedError("Invalid email or password", code="INVALID_CREDENTIALS")
    if not verify_password(data.password, user["password_hash"]):
        raise UnauthorizedError("Invalid email or password", code="INVALID_CREDENTIALS")
    if not user["is_active"]:
        raise ForbiddenError("This account has been disabled", code="ACCOUNT_DISABLED")
    return ok(_token_response(user))


def refresh(req):
    data = parse_body(RefreshRequest, req)
    payload = decode_token(data.refresh_token, REFRESH)
    user = repository.find_by_id(req.conn, int(payload["sub"]))
    if user is None or not user["is_active"]:
        raise UnauthorizedError("Your session is no longer valid, please log in again", code="INVALID_TOKEN")
    return ok(_token_response(user))


def me(req):
    return ok(session_user(req.user))


def register(router) -> None:
    router.add("POST", "/auth/login", login, public=True)
    router.add("POST", "/auth/refresh", refresh, public=True)
    router.add("GET", "/auth/me", me)
