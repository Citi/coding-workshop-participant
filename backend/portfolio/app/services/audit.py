"""Audit trail: one append-only ``audit_logs`` row per create, update or delete.

Call ``record_audit`` inside the same ``transaction()`` block as the change, so a
failed mutation writes no audit row and a successful one always writes exactly one.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.db.models import AuditLog, User

# Columns that must never be copied into an audit state.
_NEVER_AUDITED = frozenset({"password_hash"})


def _json_safe(value: Any) -> Any:
    """Convert column values to JSON-compatible primitives."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def to_state(obj: Any) -> dict[str, Any]:
    """Snapshot an ORM row's column values as a JSON-safe dict, excluding secrets."""
    mapper = inspect(obj).mapper
    return {
        column.key: _json_safe(getattr(obj, column.key))
        for column in mapper.column_attrs
        if column.key not in _NEVER_AUDITED
    }


def record_audit(
    session: Session,
    *,
    actor: User | None,
    entity_type: str,
    entity_id: int | None,
    action: str,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> AuditLog:
    """Add one audit row to the session; the caller's transaction commits it."""
    entry = AuditLog(
        actor_id=actor.id if actor is not None else None,
        actor_email=actor.email if actor is not None else None,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        before_state={k: v for k, v in before.items() if k not in _NEVER_AUDITED} if before else None,
        after_state={k: v for k, v in after.items() if k not in _NEVER_AUDITED} if after else None,
    )
    session.add(entry)
    session.flush()
    return entry
