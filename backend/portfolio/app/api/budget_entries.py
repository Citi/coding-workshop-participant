"""Budget entry routes: every signed-in role can read; ADMIN and PM can create, change and delete."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import PageParams, page_params
from app.db.models import User
from app.db.session import get_db
from app.schemas.budget_entries import BudgetCategory, BudgetEntryCreate, BudgetEntryOut, BudgetEntryUpdate
from app.schemas.common import Page
from app.schemas.departments import MAX_ID
from app.security import MANAGERS, get_current_user, require_roles
from app.services import budget_entries as service

router = APIRouter(prefix="/budget-entries", tags=["budget entries"])

BudgetEntryId = Annotated[int, Path(ge=1, le=MAX_ID, description="Budget entry id.")]


@router.get("", response_model=Page[BudgetEntryOut])
def list_budget_entries(
    project_id: Annotated[int | None, Query(ge=1, le=MAX_ID, description="Only this project's entries.")] = None,
    category: Annotated[BudgetCategory | None, Query(description="Only entries in this category.")] = None,
    page: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[BudgetEntryOut]:
    """List budget entries ordered by id: ``{items, total}``, filtered by ``project_id`` and ``category``."""
    rows, total = service.list_budget_entries(
        db, project_id=project_id, category=category, limit=page.limit, offset=page.offset
    )
    return Page[BudgetEntryOut](items=[BudgetEntryOut.from_entry(row) for row in rows], total=total)


@router.post("", status_code=201, response_model=BudgetEntryOut)
def create_budget_entry(
    body: BudgetEntryCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> BudgetEntryOut:
    """Record spend against a project (ADMIN, PM); 400 for bad fields or an unknown project."""
    return BudgetEntryOut.from_entry(service.create_budget_entry(db, actor=actor, data=body))


@router.get("/{entry_id}", response_model=BudgetEntryOut)
def get_budget_entry(
    entry_id: BudgetEntryId,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> BudgetEntryOut:
    """Return one budget entry; 404 when it does not exist."""
    return BudgetEntryOut.from_entry(service.get_budget_entry(db, entry_id))


@router.put("/{entry_id}", response_model=BudgetEntryOut)
def update_budget_entry(
    entry_id: BudgetEntryId,
    body: BudgetEntryUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> BudgetEntryOut:
    """Change any subset of a budget entry's fields (ADMIN, PM)."""
    return BudgetEntryOut.from_entry(service.update_budget_entry(db, actor=actor, entry_id=entry_id, data=body))


@router.delete("/{entry_id}", status_code=204, response_class=Response)
def delete_budget_entry(
    entry_id: BudgetEntryId,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> Response:
    """Delete a budget entry (ADMIN, PM): 204 with no body."""
    service.delete_budget_entry(db, actor=actor, entry_id=entry_id)
    return Response(status_code=204)
