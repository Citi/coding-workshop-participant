"""Resource allocations: reads for every role and audited ADMIN/PM changes with a capacity warning.

Creating or updating an allocation is always allowed, even when it pushes the
person above 100%: the platform surfaces conflicts instead of blocking them
(spec section 8). After the change is committed, the person's allocations go
through the capacity engine's sweep, and every conflict segment (load above
100) that includes this allocation is reported as a window in the warning.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Deliverable, ResourceAllocation, User
from app.db.session import transaction
from app.engines.capacity import FULL_LOAD, sweep
from app.engines.types import AllocationFact, Segment
from app.errors import NotFound, ValidationFailed
from app.schemas.allocations import AllocationCreate, AllocationUpdate, CapacityWarning, CapacityWindow
from app.services.audit import record_audit, to_state
from app.services.projects import check_dates, invalid_reference, resolve_project, resolve_user

ENTITY_TYPE = "allocation"


# --- Reads -----------------------------------------------------------------------------------------


def get_allocation(db: Session, allocation_id: int) -> ResourceAllocation:
    """Return the allocation with this id, or raise 404 ``NOT_FOUND``."""
    allocation = db.get(ResourceAllocation, allocation_id)
    if allocation is None:
        raise NotFound(f"Allocation {allocation_id} was not found.")
    return allocation


def list_allocations(
    db: Session,
    *,
    user_id: int | None = None,
    project_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[ResourceAllocation], int]:
    """Return one page of allocations ordered by id, plus the total number of matches."""
    conditions: list[Any] = []
    if user_id is not None:
        conditions.append(ResourceAllocation.user_id == user_id)
    if project_id is not None:
        conditions.append(ResourceAllocation.project_id == project_id)
    total = db.scalar(select(func.count()).select_from(ResourceAllocation).where(*conditions)) or 0
    rows = db.scalars(
        select(ResourceAllocation).where(*conditions).order_by(ResourceAllocation.id).limit(limit).offset(offset)
    ).all()
    return list(rows), total


# --- Capacity warning ------------------------------------------------------------------------------


def _window_text(segment: Segment) -> str:
    """Describe one conflict window: '120% from 2026-11-23 to 2026-12-07'."""
    return f"{segment.load}% from {segment.start_date.isoformat()} to {segment.end_date.isoformat()}"


def capacity_warning(db: Session, allocation: ResourceAllocation) -> CapacityWarning | None:
    """Return a warning when the person is above 100% in any window that includes this allocation.

    One query loads all of the person's allocations; ``capacity.sweep`` turns
    them into segments. Conflict segments elsewhere in the person's calendar
    (not including this allocation) are not reported. None when there is no
    such window.
    """
    user = allocation.user
    stmt = (
        select(
            ResourceAllocation.id,
            ResourceAllocation.project_id,
            ResourceAllocation.deliverable_id,
            ResourceAllocation.allocation_percentage,
            ResourceAllocation.start_date,
            ResourceAllocation.end_date,
        )
        .where(ResourceAllocation.user_id == user.id)
        .order_by(ResourceAllocation.id)
    )
    facts = [
        AllocationFact(
            id=row.id,
            user_id=user.id,
            user_name=user.name,
            user_department_id=user.department_id,
            project_id=row.project_id,
            deliverable_id=row.deliverable_id,
            allocation_percentage=row.allocation_percentage,
            start_date=row.start_date,
            end_date=row.end_date,
        )
        for row in db.execute(stmt)
    ]
    windows = [
        segment for segment in sweep(facts) if segment.load > FULL_LOAD and allocation.id in segment.allocation_ids
    ]
    if not windows:
        return None
    described = [_window_text(window) for window in windows]
    listed = described[0] if len(described) == 1 else f"{', '.join(described[:-1])} and {described[-1]}"
    return CapacityWarning(
        user_id=user.id,
        user_name=user.name,
        peak_load=max(window.load for window in windows),
        windows=[
            CapacityWindow(start_date=window.start_date, end_date=window.end_date, load=window.load)
            for window in windows
        ],
        message=f"Saved, but {user.name} is now allocated above 100%: {listed}.",
    )


# --- Changes ---------------------------------------------------------------------------------------


def _resolve_deliverable(db: Session, deliverable_id: int | None, project_id: int) -> Deliverable | None:
    """Load the linked deliverable, which must exist (400 ``INVALID_REFERENCE``) and belong to the project.

    A deliverable of another project is a 400 ``VALIDATION_ERROR`` on ``deliverable_id``.
    """
    if deliverable_id is None:
        return None
    deliverable = db.get(Deliverable, deliverable_id)
    if deliverable is None:
        raise invalid_reference("deliverable_id", "deliverable", deliverable_id)
    _check_same_project(deliverable, project_id)
    return deliverable


def _check_same_project(deliverable: Deliverable, project_id: int) -> None:
    """Raise 400 ``VALIDATION_ERROR`` on ``deliverable_id`` when the deliverable is in another project."""
    if deliverable.project_id != project_id:
        raise ValidationFailed(
            "The deliverable must belong to the allocation's project.",
            details=[
                {
                    "field": "deliverable_id",
                    "issue": (
                        f"Deliverable {deliverable.id} belongs to project {deliverable.project_id}, "
                        f"not project {project_id}."
                    ),
                }
            ],
        )


def _resolve_user(db: Session, user_id: int) -> User:
    """Load the allocated person; raise 400 ``INVALID_REFERENCE`` on ``user_id`` when missing."""
    return resolve_user(db, user_id, field="user_id")


def create_allocation(
    db: Session, *, actor: User, data: AllocationCreate
) -> tuple[ResourceAllocation, CapacityWarning | None]:
    """Create an allocation with one CREATE audit row, in one transaction; return it and its warning.

    Checks, in order: dates (400 ``VALIDATION_ERROR`` on ``end_date``), the
    person, the project and the deliverable (400 ``INVALID_REFERENCE``), and
    that the deliverable belongs to the project (400 ``VALIDATION_ERROR``).
    """
    with transaction(db):
        check_dates(data.start_date, data.end_date)
        user = _resolve_user(db, data.user_id)
        project = resolve_project(db, data.project_id)
        deliverable = _resolve_deliverable(db, data.deliverable_id, project.id)
        allocation = ResourceAllocation(
            user=user,
            project=project,
            deliverable=deliverable,
            allocation_percentage=data.allocation_percentage,
            start_date=data.start_date,
            end_date=data.end_date,
        )
        db.add(allocation)
        db.flush()
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=allocation.id,
            action="CREATE",
            before=None,
            after=to_state(allocation),
        )
    return allocation, capacity_warning(db, allocation)


def update_allocation(
    db: Session, *, actor: User, allocation_id: int, data: AllocationUpdate
) -> tuple[ResourceAllocation, CapacityWarning | None]:
    """Apply the fields sent in ``data`` with one UPDATE audit row, in one transaction.

    Dates and the deliverable's project are checked on the merged values: moving
    an allocation to another project while keeping a deliverable of the old one
    is a 400 ``VALIDATION_ERROR`` on ``deliverable_id``. 404 for an unknown id.
    """
    changes = data.model_fields_set
    with transaction(db):
        allocation = get_allocation(db, allocation_id)
        # Null is refused for these fields, so None here means "not sent": keep the stored value.
        start_date = data.start_date if data.start_date is not None else allocation.start_date
        end_date = data.end_date if data.end_date is not None else allocation.end_date
        check_dates(start_date, end_date)
        user = _resolve_user(db, data.user_id) if data.user_id is not None else allocation.user
        project = resolve_project(db, data.project_id) if data.project_id is not None else allocation.project
        if "deliverable_id" in changes:
            deliverable = _resolve_deliverable(db, data.deliverable_id, project.id)
        else:
            deliverable = allocation.deliverable
            if deliverable is not None:
                _check_same_project(deliverable, project.id)

        before = to_state(allocation)
        allocation.user = user
        allocation.project = project
        allocation.deliverable = deliverable
        if data.allocation_percentage is not None:
            allocation.allocation_percentage = data.allocation_percentage
        allocation.start_date = start_date
        allocation.end_date = end_date
        db.flush()
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=allocation.id,
            action="UPDATE",
            before=before,
            after=to_state(allocation),
        )
    return allocation, capacity_warning(db, allocation)


def delete_allocation(db: Session, *, actor: User, allocation_id: int) -> None:
    """Delete an allocation with one DELETE audit row, in one transaction; 404 for an unknown id."""
    with transaction(db):
        allocation = get_allocation(db, allocation_id)
        before = to_state(allocation)
        db.delete(allocation)
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
