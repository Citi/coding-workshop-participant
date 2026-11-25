"""User administration rules: unique emails, bcrypt-hashed passwords, and admins may not lock
themselves out (change their own role, deactivate their own account or delete it)."""

from app.auth import repository as auth_repository
from app.auth.passwords import hash_password
from app.core.errors import ConflictError, InvalidOperationError, NotFoundError
from app.core.http import list_result
from app.users import repository
from app.users.schemas import UserCreateRequest, UserUpdateRequest

NOT_FOUND = "User not found"
DUPLICATE_EMAIL = "A user with this email already exists"
OWN_ROLE = "You cannot change your own role"
OWN_DEACTIVATION = "You cannot deactivate your own account"
OWN_DELETION = "You cannot delete your own account"


def list_users(conn, *, search=None, role=None, is_active=None) -> dict:
    """Filtered users, sorted by full name."""
    items = repository.list_users(conn, search=search, role=role, is_active=is_active)
    return list_result(items)


def get_user(conn, user_id: int) -> dict:
    """One user (404 when it does not exist)."""
    return _found(auth_repository.find_by_id(conn, user_id))


def create_user(conn, data: UserCreateRequest) -> dict:
    """Create an account with a unique email; only the password's hash is stored."""
    _ensure_unique_email(conn, data.email)
    return repository.insert_user(conn, _stored_fields(data))


def update_user(conn, user_id: int, data: UserUpdateRequest, *, current_user: dict) -> dict:
    """Full update: 404 for an unknown id, 400 when admins would lock themselves out, 409 for a taken email."""
    get_user(conn, user_id)
    if user_id == current_user["id"]:
        _ensure_no_self_lockout(current_user, data)
    _ensure_unique_email(conn, data.email, exclude_id=user_id)
    return _found(repository.update_user(conn, user_id, _stored_fields(data)))


def delete_user(conn, user_id: int, *, current_user: dict) -> None:
    """Delete an account: 400 for your own, 404 when it does not exist."""
    if user_id == current_user["id"]:
        raise InvalidOperationError(OWN_DELETION)
    if not repository.delete_user(conn, user_id):
        raise NotFoundError(NOT_FOUND)


def _found(user: dict | None) -> dict:
    """404 when a lookup or an UPDATE matched no row (e.g. another request deleted the user meanwhile)."""
    if user is None:
        raise NotFoundError(NOT_FOUND)
    return user


def _stored_fields(data: UserCreateRequest | UserUpdateRequest) -> dict:
    """The users columns for a request: the password becomes its bcrypt hash (None keeps the current one)."""
    values = data.model_dump(exclude={"password"})
    values["password_hash"] = hash_password(data.password) if data.password is not None else None
    return values


def _ensure_unique_email(conn, email: str, exclude_id: int | None = None) -> None:
    """409 when another user already has this email (case-insensitive)."""
    if repository.email_taken(conn, email, exclude_id=exclude_id):
        raise ConflictError(DUPLICATE_EMAIL, details={"email": DUPLICATE_EMAIL})


def _ensure_no_self_lockout(current_user: dict, data: UserUpdateRequest) -> None:
    """Admins may edit their own name, email and password, but not their own role or active flag."""
    if data.role != current_user["role"]:
        raise InvalidOperationError(OWN_ROLE, details={"role": OWN_ROLE})
    if not data.is_active:
        raise InvalidOperationError(OWN_DEACTIVATION, details={"is_active": OWN_DEACTIVATION})
