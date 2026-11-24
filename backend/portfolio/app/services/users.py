"""User accounts: registration, credential checks and ADMIN changes.

Each change runs in one transaction with exactly one audit row. Audit states
never contain ``password_hash``; a password change is recorded as
``"password_changed": true`` in the after state instead.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Department, User
from app.db.session import transaction
from app.errors import Conflict, InvalidReference, NotFound
from app.schemas.auth import RegisterRequest
from app.schemas.users import UserCreate, UserUpdate
from app.security import hash_password, simulate_password_check, verify_password
from app.services.audit import record_audit, to_state

ENTITY_TYPE = "user"

# Role given to every self-registered account (spec section 5.8).
DEFAULT_ROLE = "VIEWER"

_UNIQUE_VIOLATION = "23505"


def get_user(db: Session, user_id: int) -> User:
    """Return the user with this id, or raise 404 ``NOT_FOUND``."""
    user = db.get(User, user_id)
    if user is None:
        raise NotFound(f"User {user_id} was not found.")
    return user


def find_user_by_email(db: Session, email: str) -> User | None:
    """Return the user with this email address, ignoring case, or None."""
    stmt = select(User).where(func.lower(User.email) == func.lower(email)).limit(1)
    return db.scalars(stmt).first()


def authenticate(db: Session, email: str, password: str) -> User | None:
    """Return the user when the email and password match, otherwise None.

    An unknown email still costs one bcrypt check, so timing does not reveal
    which addresses have accounts.
    """
    user = find_user_by_email(db, email)
    if user is None:
        simulate_password_check(password)
        return None
    return user if verify_password(password, user.password_hash) else None


def list_users(
    db: Session,
    *,
    q: str | None = None,
    role: str | None = None,
    department_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[User], int]:
    """Return one page of users ordered by id, plus the total number of matches.

    ``q`` matches name or email, case-insensitively, anywhere in the text. A page
    that starts after the last match is empty without a second query, so an
    offset larger than PostgreSQL's BIGINT never reaches the database.
    """
    conditions: list[Any] = []
    term = (q or "").strip()
    if term:
        conditions.append(
            or_(
                User.name.icontains(term, autoescape=True),
                User.email.icontains(term, autoescape=True),
            )
        )
    if role is not None:
        conditions.append(User.role == role)
    if department_id is not None:
        conditions.append(User.department_id == department_id)
    total = db.scalar(select(func.count()).select_from(User).where(*conditions)) or 0
    if offset >= total:
        return [], total
    stmt = select(User).where(*conditions).order_by(User.id).limit(limit).offset(offset)
    return list(db.scalars(stmt).all()), total


def _resolve_department(db: Session, department_id: int | None) -> Department | None:
    """Load the referenced department; raise 400 ``INVALID_REFERENCE`` if it is missing."""
    if department_id is None:
        return None
    department = db.get(Department, department_id)
    if department is None:
        raise InvalidReference(
            f"Department {department_id} does not exist.",
            details=[
                {"field": "department_id", "issue": f"No department has id {department_id}."}
            ],
        )
    return department


def _duplicate_email(email: str) -> Conflict:
    """Build the 409 for an email address that already has an account."""
    return Conflict(
        f"An account with the email {email} already exists.",
        details=[{"field": "email", "issue": "Email addresses must be unique, ignoring case."}],
    )


def _ensure_email_free(db: Session, email: str, exclude_id: int | None = None) -> None:
    """Raise 409 when another user already has this email, ignoring case."""
    stmt = select(User.id).where(func.lower(User.email) == func.lower(email))
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    if db.scalar(stmt.limit(1)) is not None:
        raise _duplicate_email(email)


def _flush_email(db: Session, email: str) -> None:
    """Flush, turning a unique-email race lost to a concurrent request into the same 409."""
    try:
        db.flush()
    except IntegrityError as exc:
        if getattr(exc.orig, "sqlstate", None) == _UNIQUE_VIOLATION:
            raise _duplicate_email(email) from exc
        raise


def _insert_user(
    db: Session,
    *,
    actor: User | None,
    name: str,
    email: str,
    password: str,
    role: str,
    department_id: int | None,
) -> User:
    """Insert a user and its CREATE audit row in one transaction.

    With ``actor=None`` (self-registration) the new user is recorded as the actor.
    """
    with transaction(db):
        department = _resolve_department(db, department_id)
        _ensure_email_free(db, email)
        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role=role,
            department=department,
        )
        db.add(user)
        _flush_email(db, email)
        record_audit(
            db,
            actor=actor if actor is not None else user,
            entity_type=ENTITY_TYPE,
            entity_id=user.id,
            action="CREATE",
            before=None,
            after=to_state(user),
        )
    return user


def register_user(db: Session, data: RegisterRequest) -> User:
    """Create a self-registered account. The role is always VIEWER."""
    return _insert_user(
        db,
        actor=None,
        name=data.name,
        email=data.email,
        password=data.password,
        role=DEFAULT_ROLE,
        department_id=data.department_id,
    )


def create_user(db: Session, *, actor: User, data: UserCreate) -> User:
    """Create a user with any role (ADMIN only, enforced by the router)."""
    return _insert_user(
        db,
        actor=actor,
        name=data.name,
        email=data.email,
        password=data.password,
        role=data.role,
        department_id=data.department_id,
    )


def update_user(db: Session, *, actor: User, user_id: int, data: UserUpdate) -> User:
    """Apply the fields sent in ``data`` and write one UPDATE audit row, in one transaction.

    Raises 404 for an unknown user, 400 ``INVALID_REFERENCE`` for an unknown
    department, and 409 for a duplicate email or an admin changing their own role.
    """
    changes = data.model_fields_set
    with transaction(db):
        user = get_user(db, user_id)
        if "role" in changes and user.id == actor.id and data.role != user.role:
            raise Conflict(
                "You cannot change your own role. Ask another ADMIN to do it.",
                details=[{"field": "role", "issue": "An admin cannot change their own role."}],
            )
        department = None
        if "department_id" in changes:
            department = _resolve_department(db, data.department_id)
        if "email" in changes and data.email is not None:
            _ensure_email_free(db, data.email, exclude_id=user.id)
        before = to_state(user)
        if "name" in changes and data.name is not None:
            user.name = data.name
        if "email" in changes and data.email is not None:
            user.email = data.email
        if "role" in changes and data.role is not None:
            user.role = data.role
        if "department_id" in changes:
            user.department = department
        if "password" in changes and data.password is not None:
            user.password_hash = hash_password(data.password)
        _flush_email(db, user.email)
        after = to_state(user)
        if "password" in changes:
            after["password_changed"] = True
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=user.id,
            action="UPDATE",
            before=before,
            after=after,
        )
    return user


def delete_user(db: Session, *, actor: User, user_id: int) -> None:
    """Delete a user and write one DELETE audit row, in one transaction.

    An admin cannot delete their own account (409). The database clears the
    user from projects and deliverables and removes their allocations
    (the ``ON DELETE`` rules in ``schema.sql``).
    """
    with transaction(db):
        user = get_user(db, user_id)
        if user.id == actor.id:
            raise Conflict("You cannot delete your own account. Ask another ADMIN to do it.")
        before = to_state(user)
        db.delete(user)
        db.flush()
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=before["id"],
            action="DELETE",
            before=before,
            after=None,
        )
