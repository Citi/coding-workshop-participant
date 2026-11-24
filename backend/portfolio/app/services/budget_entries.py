"""Budget entries: reads for every role and audited ADMIN/PM changes.

A project's actual spend is the sum of its budget entries (there is no stored
actual-spend column), so every change here shows up in the project metrics
and analytics on the next read.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import BudgetEntry, User
from app.db.session import transaction
from app.errors import NotFound
from app.schemas.budget_entries import BudgetEntryCreate, BudgetEntryUpdate
from app.services.audit import record_audit, to_state
from app.services.projects import resolve_project

ENTITY_TYPE = "budget_entry"


def get_budget_entry(db: Session, entry_id: int) -> BudgetEntry:
    """Return the budget entry with this id, or raise 404 ``NOT_FOUND``."""
    entry = db.get(BudgetEntry, entry_id)
    if entry is None:
        raise NotFound(f"Budget entry {entry_id} was not found.")
    return entry


def list_budget_entries(
    db: Session,
    *,
    project_id: int | None = None,
    category: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[BudgetEntry], int]:
    """Return one page of budget entries ordered by id, plus the total number of matches."""
    conditions: list[Any] = []
    if project_id is not None:
        conditions.append(BudgetEntry.project_id == project_id)
    if category is not None:
        conditions.append(BudgetEntry.category == category)
    total = db.scalar(select(func.count()).select_from(BudgetEntry).where(*conditions)) or 0
    rows = db.scalars(
        select(BudgetEntry).where(*conditions).order_by(BudgetEntry.id).limit(limit).offset(offset)
    ).all()
    return list(rows), total


def create_budget_entry(db: Session, *, actor: User, data: BudgetEntryCreate) -> BudgetEntry:
    """Record spend against a project with one CREATE audit row, in one transaction.

    400 ``INVALID_REFERENCE`` on ``project_id`` when the project does not exist.
    """
    with transaction(db):
        project = resolve_project(db, data.project_id)
        entry = BudgetEntry(
            project=project,
            category=data.category,
            description=data.description,
            amount=data.amount,
            entry_date=data.entry_date,
        )
        db.add(entry)
        db.flush()
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=entry.id,
            action="CREATE",
            before=None,
            after=to_state(entry),
        )
    return entry


def update_budget_entry(db: Session, *, actor: User, entry_id: int, data: BudgetEntryUpdate) -> BudgetEntry:
    """Apply the fields sent in ``data`` with one UPDATE audit row, in one transaction.

    404 for an unknown entry; 400 ``INVALID_REFERENCE`` for an unknown project.
    """
    changes = data.model_fields_set
    with transaction(db):
        entry = get_budget_entry(db, entry_id)
        project = resolve_project(db, data.project_id) if data.project_id is not None else None
        before = to_state(entry)
        if project is not None:
            entry.project = project
        if data.category is not None:
            entry.category = data.category
        if "description" in changes:
            entry.description = data.description
        if data.amount is not None:
            entry.amount = data.amount
        if data.entry_date is not None:
            entry.entry_date = data.entry_date
        db.flush()
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=entry.id,
            action="UPDATE",
            before=before,
            after=to_state(entry),
        )
    return entry


def delete_budget_entry(db: Session, *, actor: User, entry_id: int) -> None:
    """Delete a budget entry with one DELETE audit row, in one transaction; 404 for an unknown id."""
    with transaction(db):
        entry = get_budget_entry(db, entry_id)
        before = to_state(entry)
        db.delete(entry)
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
