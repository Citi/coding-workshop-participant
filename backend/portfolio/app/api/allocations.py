"""Allocation routes: every signed-in role can read; ADMIN and PM can create, change and delete.

Saving an allocation is never blocked by over-allocation: ``POST`` and ``PUT``
return the allocation plus ``capacity_warning`` (null, or the windows in which
the person is above 100% while this allocation runs).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import PageParams, page_params
from app.db.models import User
from app.db.session import get_db
from app.schemas.allocations import AllocationCreate, AllocationOut, AllocationUpdate, AllocationWriteOut
from app.schemas.common import Page
from app.schemas.departments import MAX_ID
from app.security import MANAGERS, get_current_user, require_roles
from app.services import allocations as service

router = APIRouter(prefix="/allocations", tags=["allocations"])

AllocationId = Annotated[int, Path(ge=1, le=MAX_ID, description="Allocation id.")]


@router.get("", response_model=Page[AllocationOut])
def list_allocations(
    user_id: Annotated[int | None, Query(ge=1, le=MAX_ID, description="Only this person's allocations.")] = None,
    project_id: Annotated[int | None, Query(ge=1, le=MAX_ID, description="Only this project's allocations.")] = None,
    page: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[AllocationOut]:
    """List allocations ordered by id: ``{items, total}``, filtered by ``user_id`` and ``project_id``."""
    rows, total = service.list_allocations(
        db, user_id=user_id, project_id=project_id, limit=page.limit, offset=page.offset
    )
    return Page[AllocationOut](items=[AllocationOut.from_allocation(row) for row in rows], total=total)


@router.post("", status_code=201, response_model=AllocationWriteOut)
def create_allocation(
    body: AllocationCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> AllocationWriteOut:
    """Create an allocation (ADMIN, PM); the response adds ``capacity_warning``.

    400 ``INVALID_REFERENCE`` for an unknown person, project or deliverable; 400
    ``VALIDATION_ERROR`` for bad fields, an end date before the start date, or a
    deliverable of another project.
    """
    allocation, warning = service.create_allocation(db, actor=actor, data=body)
    return AllocationWriteOut.from_write(allocation, warning)


@router.get("/{allocation_id}", response_model=AllocationOut)
def get_allocation(
    allocation_id: AllocationId,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AllocationOut:
    """Return one allocation; 404 when it does not exist."""
    return AllocationOut.from_allocation(service.get_allocation(db, allocation_id))


@router.put("/{allocation_id}", response_model=AllocationWriteOut)
def update_allocation(
    allocation_id: AllocationId,
    body: AllocationUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> AllocationWriteOut:
    """Change any subset of an allocation's fields (ADMIN, PM); the response adds ``capacity_warning``."""
    allocation, warning = service.update_allocation(db, actor=actor, allocation_id=allocation_id, data=body)
    return AllocationWriteOut.from_write(allocation, warning)


@router.delete("/{allocation_id}", status_code=204, response_class=Response)
def delete_allocation(
    allocation_id: AllocationId,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*MANAGERS)),
) -> Response:
    """Delete an allocation (ADMIN, PM): 204 with no body."""
    service.delete_allocation(db, actor=actor, allocation_id=allocation_id)
    return Response(status_code=204)
