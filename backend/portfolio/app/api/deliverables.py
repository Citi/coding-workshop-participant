"""Deliverable routes: every signed-in role reads; ADMIN, PM and LEAD create and update; ADMIN and PM delete."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import PageParams, page_params, today_utc
from app.db.models import User
from app.db.session import get_db
from app.schemas.common import Page
from app.schemas.deliverables import (
    TITLE_MAX_LENGTH,
    DeliverableCreate,
    DeliverableImpactOut,
    DeliverableOut,
    DeliverableStatus,
    DeliverableUpdate,
)
from app.schemas.departments import MAX_ID, SearchText
from app.security import CONTRIBUTORS, MANAGERS, get_current_user, require_roles
from app.services import deliverables as service

router = APIRouter(prefix="/deliverables", tags=["deliverables"])

DeliverableId = Annotated[int, Path(ge=1, le=MAX_ID, description="Deliverable id.")]

# Control characters (NUL above all, which PostgreSQL cannot compare) are a 400 on q,
# refused before any query runs. Titles never hold one, so no possible match is lost.
TitleSearch = Annotated[
    SearchText | None,
    Query(max_length=TITLE_MAX_LENGTH, description="Title contains (ignoring case)."),
]


@router.get("", response_model=Page[DeliverableOut])
def list_deliverables(
    q: TitleSearch = None,
    project_id: Annotated[int | None, Query(ge=1, le=MAX_ID, description="Only this project's deliverables.")] = None,
    status: Annotated[DeliverableStatus | None, Query(description="Only deliverables with this status.")] = None,
    assigned_user_id: Annotated[
        int | None, Query(ge=1, le=MAX_ID, description="Only deliverables assigned to this user.")
    ] = None,
    overdue: Annotated[
        bool, Query(description="true: only deliverables not DONE and due before today (UTC).")
    ] = False,
    page: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[DeliverableOut]:
    """List deliverables across the portfolio ordered by id: ``{items, total}``.

    Filters combine with AND. ``overdue=true`` keeps deliverables that are not
    DONE and were due before today (UTC); ``overdue=false`` does not filter.
    Every item carries ``is_overdue``.
    """
    today = today_utc()
    rows, total = service.list_deliverables(
        db,
        today=today,
        q=q,
        project_id=project_id,
        status=status,
        assigned_user_id=assigned_user_id,
        overdue=overdue,
        limit=page.limit,
        offset=page.offset,
    )
    return Page[DeliverableOut](items=[DeliverableOut.from_row(row, today) for row in rows], total=total)


@router.post("", status_code=201, response_model=DeliverableOut)
def create_deliverable(
    body: DeliverableCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*CONTRIBUTORS)),
) -> DeliverableOut:
    """Create a deliverable (ADMIN, PM, LEAD).

    400 for a due date before the start date or an unknown project or assignee.
    Status DONE sets completion to 100; a blocked reason is kept only for BLOCKED.
    """
    deliverable = service.create_deliverable(db, actor=actor, data=body)
    return DeliverableOut.from_deliverable(deliverable, today_utc())


@router.get("/{deliverable_id}/impact", response_model=DeliverableImpactOut)
def get_deliverable_impact(
    deliverable_id: DeliverableId,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DeliverableImpactOut:
    """Return every deliverable downstream of this one with its depth and status; 404 when it does not exist."""
    return service.deliverable_impact(db, deliverable_id)


@router.get("/{deliverable_id}", response_model=DeliverableOut)
def get_deliverable(
    deliverable_id: DeliverableId,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DeliverableOut:
    """Return one deliverable; 404 when it does not exist."""
    return DeliverableOut.from_deliverable(service.get_deliverable(db, deliverable_id), today_utc())


@router.put("/{deliverable_id}", response_model=DeliverableOut)
def update_deliverable(
    deliverable_id: DeliverableId,
    body: DeliverableUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*CONTRIBUTORS)),
) -> DeliverableOut:
    """Change any subset of a deliverable's fields except its project (ADMIN, PM, LEAD).

    Leaving BLOCKED clears the blocked reason; DONE sets completion to 100.
    """
    deliverable = service.update_deliverable(db, actor=actor, deliverable_id=deliverable_id, data=body)
    return DeliverableOut.from_deliverable(deliverable, today_utc())


@router.delete("/{deliverable_id}", status_code=204, response_class=Response)
def delete_deliverable(
    deliverable_id: DeliverableId,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> Response:
    """Delete a deliverable and its dependency edges (ADMIN, PM): 204 with no body."""
    service.delete_deliverable(db, actor=actor, deliverable_id=deliverable_id)
    return Response(status_code=204)
