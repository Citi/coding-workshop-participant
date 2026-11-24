"""Response model for audit log entries (read-only; the table is append-only)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from app.schemas.common import ResponseModel

AuditAction = Literal["CREATE", "UPDATE", "DELETE"]


class AuditLogOut(ResponseModel):
    """One audit row: who changed which record, how, and its state before and after.

    States are JSON snapshots of the row's columns and never contain a password
    hash. ``before_state`` is null for CREATE and ``after_state`` is null for DELETE.
    """

    id: int
    actor_id: int | None
    actor_email: str | None
    entity_type: str
    entity_id: int | None
    action: AuditAction
    before_state: dict[str, Any] | None
    after_state: dict[str, Any] | None
    created_at: datetime
