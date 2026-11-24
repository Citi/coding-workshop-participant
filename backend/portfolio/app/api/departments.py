"""Department routes: every signed-in role can read; only ADMIN can create, rename or delete."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import PageParams, page_params
from app.db.models import User
from app.db.session import get_db
from app.schemas.common import Page
from app.schemas.departments import (
    MAX_ID,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    SearchText,
)
from app.security import get_current_user, require_roles
from app.services import departments as service

router = APIRouter(prefix="/departments", tags=["departments"])

DepartmentId = Annotated[int, Path(ge=1, le=MAX_ID, description="Department id.")]

# Control characters (NUL above all, which PostgreSQL cannot compare) are a 400.
NameSearch = Annotated[
    SearchText | None,
    Query(max_length=100, description="Name contains (ignoring case)."),
]


@router.get("", response_model=Page[DepartmentOut])
def list_departments(
    q: NameSearch = None,
    page: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[DepartmentOut]:
    """List departments ordered by id: ``{items, total}``, with ``limit`` and ``offset``."""
    rows, total = service.list_departments(db, q=q, limit=page.limit, offset=page.offset)
    items = [DepartmentOut.model_validate(row) for row in rows]
    return Page[DepartmentOut](items=items, total=total)


@router.post("", status_code=201, response_model=DepartmentOut)
def create_department(
    body: DepartmentCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("ADMIN")),
) -> DepartmentOut:
    """Create a department (ADMIN). 409 when the name exists, ignoring case."""
    return DepartmentOut.model_validate(service.create_department(db, actor=actor, data=body))


@router.get("/{department_id}", response_model=DepartmentOut)
def get_department(
    department_id: DepartmentId,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DepartmentOut:
    """Return one department; 404 when it does not exist."""
    return DepartmentOut.model_validate(service.get_department(db, department_id))


@router.put("/{department_id}", response_model=DepartmentOut)
def update_department(
    department_id: DepartmentId,
    body: DepartmentUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("ADMIN")),
) -> DepartmentOut:
    """Rename a department (ADMIN). 404 when missing, 409 when the name is taken."""
    department = service.update_department(db, actor=actor, department_id=department_id, data=body)
    return DepartmentOut.model_validate(department)


@router.delete("/{department_id}", status_code=204, response_class=Response)
def delete_department(
    department_id: DepartmentId,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles("ADMIN")),
) -> Response:
    """Delete a department (ADMIN): 204 with no body; 409 while projects still use it."""
    service.delete_department(db, actor=actor, department_id=department_id)
    return Response(status_code=204)
