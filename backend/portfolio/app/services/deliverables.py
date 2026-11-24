"""Deliverables: portfolio-wide reads, contributor changes and downstream impact.

Each change runs in one transaction with exactly one audit row (entity type
``deliverable``). The service rules of spec section 6 live here: status DONE
forces completion to 100, any status other than BLOCKED clears
``blocked_reason``, ``updated_at`` is set on every update, and the due date may
not be before the start date (checked on the merged values of an update).
``project_id`` never changes after creation.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import Row, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Deliverable, DeliverableDependency, Project, ResourceAllocation, User
from app.db.session import transaction
from app.engines.dependency import downstream
from app.errors import InvalidReference, NotFound, ValidationFailed
from app.schemas.deliverables import (
    DeliverableCreate,
    DeliverableImpactOut,
    DeliverableUpdate,
    ImpactItemOut,
)
from app.services.audit import record_audit, to_state

ENTITY_TYPE = "deliverable"

DONE = "DONE"
BLOCKED = "BLOCKED"
FULL_COMPLETION = 100

# A referenced project or user deleted by a concurrent request after the existence check.
_FOREIGN_KEY_VIOLATION = "23503"

# Deliverables with their project and assignee names, as plain columns (no ORM eager loads).
# The labels match the fields of ``DeliverableOut``.
_LIST_COLUMNS = (
    select(
        Deliverable.id,
        Deliverable.project_id,
        Project.project_name,
        Deliverable.title,
        Deliverable.description,
        Deliverable.assigned_user_id,
        User.name.label("assigned_user_name"),
        Deliverable.start_date,
        Deliverable.due_date,
        Deliverable.completion_percentage,
        Deliverable.status,
        Deliverable.blocked_reason,
        Deliverable.created_at,
        Deliverable.updated_at,
    )
    .join(Project, Project.id == Deliverable.project_id)
    .outerjoin(User, User.id == Deliverable.assigned_user_id)
)

# Every dependency edge, for downstream searches.
_ALL_EDGES = select(
    DeliverableDependency.predecessor_deliverable_id,
    DeliverableDependency.successor_deliverable_id,
)


def get_deliverable(db: Session, deliverable_id: int) -> Deliverable:
    """Return the deliverable with this id (project and assignee loaded), or raise 404 ``NOT_FOUND``."""
    deliverable = db.get(Deliverable, deliverable_id)
    if deliverable is None:
        raise NotFound(f"Deliverable {deliverable_id} was not found.")
    return deliverable


def list_deliverables(
    db: Session,
    *,
    today: date,
    q: str | None = None,
    project_id: int | None = None,
    status: str | None = None,
    assigned_user_id: int | None = None,
    overdue: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Row[Any]], int]:
    """Return one page of deliverables ordered by id, plus the total number of matches.

    ``q`` matches the title, case-insensitively, anywhere in the text. With
    ``overdue`` true only deliverables that are not DONE and were due before
    ``today`` match; false applies no overdue filter. Rows carry the fields of
    ``DeliverableOut`` except ``is_overdue``.
    """
    conditions: list[Any] = []
    term = (q or "").strip()
    if term:
        conditions.append(Deliverable.title.icontains(term, autoescape=True))
    if project_id is not None:
        conditions.append(Deliverable.project_id == project_id)
    if status is not None:
        conditions.append(Deliverable.status == status)
    if assigned_user_id is not None:
        conditions.append(Deliverable.assigned_user_id == assigned_user_id)
    if overdue:
        conditions.extend([Deliverable.status != DONE, Deliverable.due_date < today])
    total = db.scalar(select(func.count()).select_from(Deliverable).where(*conditions)) or 0
    rows = db.execute(_LIST_COLUMNS.where(*conditions).order_by(Deliverable.id).limit(limit).offset(offset)).all()
    return list(rows), total


def _check_dates(start_date: date | None, due_date: date, field: str = "due_date") -> None:
    """Raise 400 ``VALIDATION_ERROR`` when the due date is before the start date."""
    if start_date is not None and due_date < start_date:
        raise ValidationFailed(
            "The due date cannot be before the start date.",
            details=[
                {
                    "field": field,
                    "issue": f"Due date {due_date.isoformat()} is before start date {start_date.isoformat()}.",
                }
            ],
        )


def _resolve_references(
    db: Session, *, project_id: int | None, assigned_user_id: int | None
) -> tuple[Project | None, User | None]:
    """Load the referenced project and assignee; raise 400 ``INVALID_REFERENCE`` naming each missing one."""
    project = db.get(Project, project_id) if project_id is not None else None
    assignee = db.get(User, assigned_user_id) if assigned_user_id is not None else None
    messages: list[str] = []
    details: list[dict[str, Any]] = []
    if project_id is not None and project is None:
        messages.append(f"Project {project_id} does not exist.")
        details.append({"field": "project_id", "issue": f"No project has id {project_id}."})
    if assigned_user_id is not None and assignee is None:
        messages.append(f"User {assigned_user_id} (the assignee) does not exist.")
        details.append({"field": "assigned_user_id", "issue": f"No user has id {assigned_user_id}."})
    if details:
        raise InvalidReference(" ".join(messages), details=details)
    return project, assignee


def _apply_status_rules(deliverable: Deliverable) -> None:
    """Enforce the status rules: DONE means 100% complete; only BLOCKED keeps a blocked reason."""
    if deliverable.status == DONE:
        deliverable.completion_percentage = FULL_COMPLETION
    if deliverable.status != BLOCKED:
        deliverable.blocked_reason = None


def _flush(db: Session) -> None:
    """Flush, turning a project or user deleted concurrently after the check into the same 400."""
    try:
        db.flush()
    except IntegrityError as exc:
        if getattr(exc.orig, "sqlstate", None) == _FOREIGN_KEY_VIOLATION:
            raise InvalidReference("The project or the assignee no longer exists.") from exc
        raise


def create_deliverable(db: Session, *, actor: User, data: DeliverableCreate) -> Deliverable:
    """Create a deliverable and its CREATE audit row in one transaction.

    Raises 400 ``VALIDATION_ERROR`` when the due date is before the start date and
    400 ``INVALID_REFERENCE`` for an unknown project or assignee.
    """
    with transaction(db):
        _check_dates(data.start_date, data.due_date)
        project, assignee = _resolve_references(
            db, project_id=data.project_id, assigned_user_id=data.assigned_user_id
        )
        deliverable = Deliverable(
            project=project,
            title=data.title,
            description=data.description,
            assigned_user=assignee,
            start_date=data.start_date,
            due_date=data.due_date,
            completion_percentage=data.completion_percentage,
            status=data.status,
            blocked_reason=data.blocked_reason,
        )
        _apply_status_rules(deliverable)
        db.add(deliverable)
        _flush(db)
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=deliverable.id,
            action="CREATE",
            before=None,
            after=to_state(deliverable),
        )
    return deliverable


def update_deliverable(db: Session, *, actor: User, deliverable_id: int, data: DeliverableUpdate) -> Deliverable:
    """Apply the fields sent in ``data`` and write one UPDATE audit row, in one transaction.

    Raises 404 for an unknown deliverable, 400 ``VALIDATION_ERROR`` for a new
    ``project_id`` or a due date before the start date (merged values), and 400
    ``INVALID_REFERENCE`` for an unknown assignee. ``updated_at`` is always set,
    even when no value changes.
    """
    changes = data.model_fields_set
    with transaction(db):
        deliverable = get_deliverable(db, deliverable_id)
        if "project_id" in changes and data.project_id != deliverable.project_id:
            raise ValidationFailed(
                "A deliverable cannot move to another project.",
                details=[
                    {
                        "field": "project_id",
                        "issue": f"project_id is immutable; this deliverable belongs to project "
                        f"{deliverable.project_id}.",
                    }
                ],
            )
        start_date = data.start_date if "start_date" in changes else deliverable.start_date
        due_date = data.due_date if data.due_date is not None else deliverable.due_date
        _check_dates(start_date, due_date, field="due_date" if "due_date" in changes else "start_date")
        assignee = None
        if "assigned_user_id" in changes:
            _, assignee = _resolve_references(db, project_id=None, assigned_user_id=data.assigned_user_id)

        before = to_state(deliverable)
        if data.title is not None:
            deliverable.title = data.title
        if "description" in changes:
            deliverable.description = data.description
        if "assigned_user_id" in changes:
            deliverable.assigned_user = assignee
        if "start_date" in changes:
            deliverable.start_date = data.start_date
        if data.due_date is not None:
            deliverable.due_date = data.due_date
        if data.completion_percentage is not None:
            deliverable.completion_percentage = data.completion_percentage
        if data.status is not None:
            deliverable.status = data.status
        if "blocked_reason" in changes:
            deliverable.blocked_reason = data.blocked_reason
        _apply_status_rules(deliverable)
        deliverable.updated_at = func.now()
        _flush(db)
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=deliverable.id,
            action="UPDATE",
            before=before,
            after=to_state(deliverable),
        )
    return deliverable


def delete_deliverable(db: Session, *, actor: User, deliverable_id: int) -> None:
    """Delete a deliverable and write one DELETE audit row, in one transaction.

    The database also removes the deliverable's dependency edges (``ON DELETE
    CASCADE``) and unlinks allocations from it (``ON DELETE SET NULL``); the audit
    row's before state lists both, so the side effects stay traceable.
    """
    with transaction(db):
        deliverable = get_deliverable(db, deliverable_id)
        before = to_state(deliverable)
        edges = db.execute(
            select(
                DeliverableDependency.id,
                DeliverableDependency.predecessor_deliverable_id,
                DeliverableDependency.successor_deliverable_id,
            )
            .where(
                or_(
                    DeliverableDependency.predecessor_deliverable_id == deliverable.id,
                    DeliverableDependency.successor_deliverable_id == deliverable.id,
                )
            )
            .order_by(DeliverableDependency.id)
        ).all()
        if edges:
            before["removed_dependencies"] = [
                {
                    "id": edge.id,
                    "predecessor_deliverable_id": edge.predecessor_deliverable_id,
                    "successor_deliverable_id": edge.successor_deliverable_id,
                }
                for edge in edges
            ]
        allocation_ids = db.scalars(
            select(ResourceAllocation.id)
            .where(ResourceAllocation.deliverable_id == deliverable.id)
            .order_by(ResourceAllocation.id)
        ).all()
        if allocation_ids:
            before["unlinked_allocation_ids"] = list(allocation_ids)
        db.delete(deliverable)
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


def deliverable_impact(db: Session, deliverable_id: int) -> DeliverableImpactOut:
    """Return every deliverable downstream of this one (in any project) with its BFS depth and status.

    Items are ordered by depth, then id; depth 1 is a direct successor. Raises
    404 for an unknown deliverable.
    """
    source = db.execute(
        select(Deliverable.id, Deliverable.title).where(Deliverable.id == deliverable_id)
    ).first()
    if source is None:
        raise NotFound(f"Deliverable {deliverable_id} was not found.")
    depths = downstream(db.execute(_ALL_EDGES).all(), source.id)
    items: list[ImpactItemOut] = []
    if depths:
        rows = db.execute(
            select(Deliverable.id, Deliverable.title, Deliverable.project_id, Deliverable.status).where(
                Deliverable.id.in_(list(depths))
            )
        ).all()
        items = sorted(
            (
                ImpactItemOut(
                    id=row.id, title=row.title, project_id=row.project_id, status=row.status, depth=depths[row.id]
                )
                for row in rows
            ),
            key=lambda item: (item.depth, item.id),
        )
    return DeliverableImpactOut(deliverable_id=source.id, title=source.title, items=items, total=len(items))
