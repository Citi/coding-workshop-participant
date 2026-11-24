"""Audit log route: ADMIN and PM can read the append-only audit trail, newest first."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import PageParams, page_params
from app.db.models import AuditLog, User
from app.db.session import get_db
from app.schemas.audit_logs import AuditLogOut
from app.schemas.common import Page
from app.schemas.departments import MAX_ID
from app.security import MANAGERS, require_roles

router = APIRouter(prefix="/audit-logs", tags=["audit"])

# Entity types are lower-case words joined by underscores, such as ``budget_entry`` (VARCHAR(40)).
_ENTITY_TYPE_PATTERN = r"^[a-z][a-z_]*$"


@router.get("", response_model=Page[AuditLogOut])
def list_audit_logs(
    entity_type: Annotated[
        str | None,
        Query(
            min_length=1,
            max_length=40,
            pattern=_ENTITY_TYPE_PATTERN,
            description="Only this kind of record, such as project, allocation or budget_entry.",
        ),
    ] = None,
    entity_id: Annotated[int | None, Query(ge=1, le=MAX_ID, description="Only this record's id.")] = None,
    actor_id: Annotated[int | None, Query(ge=1, le=MAX_ID, description="Only changes made by this user.")] = None,
    page: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*MANAGERS)),
) -> Page[AuditLogOut]:
    """List audit entries newest first (ADMIN, PM): ``{items, total}``; LEAD and VIEWER get 403.

    Rows written in one transaction share ``created_at``, so the id breaks ties.
    """
    conditions: list[Any] = []
    if entity_type is not None:
        conditions.append(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        conditions.append(AuditLog.entity_id == entity_id)
    if actor_id is not None:
        conditions.append(AuditLog.actor_id == actor_id)
    total = db.scalar(select(func.count()).select_from(AuditLog).where(*conditions)) or 0
    rows = db.scalars(
        select(AuditLog)
        .where(*conditions)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(page.limit)
        .offset(page.offset)
    ).all()
    return Page[AuditLogOut](items=[AuditLogOut.model_validate(row) for row in rows], total=total)
