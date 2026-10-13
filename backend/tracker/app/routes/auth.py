"""Authentication endpoints: login, token refresh, current user, change password."""

from ..db import execute, fetch_one
from ..errors import AuthenticationError, ValidationError
from ..router import Context, router
from ..security import decode_token, hash_password, issue_tokens, verify_password
from ..validation import Validator
from .users import public_user


@router.add("POST", "/auth/login", public=True)
def login(ctx: Context) -> tuple[int, dict]:
    """Exchange username/email + password for an access and refresh token."""
    v = Validator(ctx.request.json())
    username = v.string("username", required=True, max_len=254, lower=True)
    password = v.string("password", required=True, max_len=200)
    v.raise_if_errors()
    user = fetch_one(
        ctx.conn,
        "SELECT * FROM users WHERE (lower(username) = %s OR lower(email) = %s) AND archived_at IS NULL",
        (username, username),
    )
    if user is None or not verify_password(password, user["password_hash"]):
        raise AuthenticationError("Incorrect username or password.")
    return 200, {**issue_tokens(user), "user": public_user(user)}


@router.add("POST", "/auth/refresh", public=True)
def refresh(ctx: Context) -> tuple[int, dict]:
    """Issue a new token pair from a valid refresh token."""
    v = Validator(ctx.request.json())
    token = v.string("refresh_token", required=True, max_len=4096)
    v.raise_if_errors()
    user_id = decode_token(token, "refresh")
    user = fetch_one(ctx.conn, "SELECT * FROM users WHERE id = %s AND archived_at IS NULL", (user_id,))
    if user is None:
        raise AuthenticationError("Your account is no longer active.")
    return 200, {**issue_tokens(user), "user": public_user(user)}


@router.add("GET", "/auth/me")
def me(ctx: Context) -> tuple[int, dict]:
    """Return the signed-in user's profile."""
    return 200, public_user(ctx.user)


@router.add("POST", "/auth/change-password")
def change_password(ctx: Context) -> tuple[int, dict]:
    """Change the caller's own password after verifying the current one."""
    v = Validator(ctx.request.json())
    current = v.string("current_password", required=True, max_len=200)
    new = v.string("new_password", required=True, min_len=8, max_len=200)
    v.raise_if_errors()
    if not verify_password(current, ctx.user["password_hash"]):
        raise ValidationError("Please correct the highlighted fields.",
                              {"current_password": "Current password is incorrect."})  # error message, not a secret  # nosec B105
    execute(ctx.conn, "UPDATE users SET password_hash = %s, updated_at = now() WHERE id = %s",
            (hash_password(new), ctx.user["id"]))
    return 200, {"message": "Password updated."}
