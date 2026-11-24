"""Department reads and ADMIN changes: each change is one transaction with one audit row."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Department, Project, User
from app.db.session import transaction
from app.errors import Conflict, NotFound
from app.schemas.departments import DepartmentCreate, DepartmentUpdate
from app.services.audit import record_audit, to_state

ENTITY_TYPE = "department"

# PostgreSQL SQLSTATE codes the services translate into friendlier errors.
_UNIQUE_VIOLATION = "23505"
# Deleting a row that an ON DELETE RESTRICT key still references: PostgreSQL 18
# reports restrict_violation (23001); earlier versions, such as Aurora's 17,
# report foreign_key_violation (23503).
_STILL_REFERENCED = frozenset({"23001", "23503"})


def get_department(db: Session, department_id: int) -> Department:
    """Return the department with this id, or raise 404 ``NOT_FOUND``."""
    department = db.get(Department, department_id)
    if department is None:
        raise NotFound(f"Department {department_id} was not found.")
    return department


def list_departments(
    db: Session, *, q: str | None = None, limit: int = 50, offset: int = 0
) -> tuple[list[Department], int]:
    """Return one page of departments ordered by id, plus the total number of matches.

    ``q`` filters by name, case-insensitively, anywhere in the name. A page that
    starts after the last match is empty without a second query, so an offset
    larger than PostgreSQL's BIGINT never reaches the database.
    """
    conditions: list[Any] = []
    term = (q or "").strip()
    if term:
        conditions.append(Department.name.icontains(term, autoescape=True))
    total = db.scalar(select(func.count()).select_from(Department).where(*conditions)) or 0
    if offset >= total:
        return [], total
    rows = db.scalars(
        select(Department).where(*conditions).order_by(Department.id).limit(limit).offset(offset)
    ).all()
    return list(rows), total


def _duplicate_name(name: str) -> Conflict:
    """Build the 409 for a department name that is already taken."""
    return Conflict(
        f"A department named '{name}' already exists.",
        details=[{"field": "name", "issue": "Department names must be unique, ignoring case."}],
    )


def _ensure_name_free(db: Session, name: str, exclude_id: int | None = None) -> None:
    """Raise 409 when another department already has this name, ignoring case."""
    stmt = select(Department.id).where(func.lower(Department.name) == func.lower(name))
    if exclude_id is not None:
        stmt = stmt.where(Department.id != exclude_id)
    if db.scalar(stmt.limit(1)) is not None:
        raise _duplicate_name(name)


def _flush_name(db: Session, name: str) -> None:
    """Flush, turning a unique-name race lost to a concurrent request into the same 409."""
    try:
        db.flush()
    except IntegrityError as exc:
        if getattr(exc.orig, "sqlstate", None) == _UNIQUE_VIOLATION:
            raise _duplicate_name(name) from exc
        raise


def _in_use(name: str, project_count: int | None = None) -> Conflict:
    """Build the 409 for deleting a department that projects still belong to."""
    projects = f"{project_count} project(s)" if project_count else "projects"
    return Conflict(f"Department '{name}' still has {projects}. Move or delete them first.")


def _project_count(db: Session, department_id: int) -> int:
    """Return how many projects belong to the department."""
    stmt = select(func.count()).select_from(Project).where(Project.department_id == department_id)
    return db.scalar(stmt) or 0


def _flush_delete(db: Session, name: str) -> None:
    """Flush a delete, turning a project added concurrently after the check into the same 409.

    ``projects.department_id`` is ``ON DELETE RESTRICT``, so that race surfaces
    as a restrict or foreign-key violation.
    """
    try:
        db.flush()
    except IntegrityError as exc:
        if getattr(exc.orig, "sqlstate", None) in _STILL_REFERENCED:
            raise _in_use(name) from exc
        raise


def create_department(db: Session, *, actor: User, data: DepartmentCreate) -> Department:
    """Create a department and its audit row in one transaction; 409 on a duplicate name."""
    with transaction(db):
        _ensure_name_free(db, data.name)
        department = Department(name=data.name)
        db.add(department)
        _flush_name(db, data.name)
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=department.id,
            action="CREATE",
            before=None,
            after=to_state(department),
        )
    return department


def update_department(
    db: Session, *, actor: User, department_id: int, data: DepartmentUpdate
) -> Department:
    """Rename a department and write its audit row in one transaction; 404 or 409 on failure."""
    with transaction(db):
        department = get_department(db, department_id)
        _ensure_name_free(db, data.name, exclude_id=department.id)
        before = to_state(department)
        department.name = data.name
        _flush_name(db, data.name)
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=department.id,
            action="UPDATE",
            before=before,
            after=to_state(department),
        )
    return department


def delete_department(db: Session, *, actor: User, department_id: int) -> None:
    """Delete a department that no project uses, with its audit row, in one transaction.

    Users in the department keep their accounts; the database sets their
    ``department_id`` to null. A department that projects still use gives 409.
    """
    with transaction(db):
        department = get_department(db, department_id)
        project_count = _project_count(db, department.id)
        if project_count:
            raise _in_use(department.name, project_count)
        before = to_state(department)
        db.delete(department)
        _flush_delete(db, before["name"])
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=before["id"],
            action="DELETE",
            before=before,
            after=None,
        )
