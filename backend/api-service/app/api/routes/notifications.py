"""The signed-in user's notifications."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import joinedload

from app.api.deps import CurrentUser, DbSession
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _out(n: Notification) -> dict:
    return {
        "id": n.id,
        "kind": n.kind,
        "message": n.message,
        "incident_id": n.incident_id,
        "incident_ref": n.incident_ref,
        "actor_name": n.actor.full_name if n.actor else None,
        "is_read": n.is_read,
        "created_at": n.created_at,
    }


def _unread(db, user_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id, Notification.is_read.is_(False)
        )
    )


@router.get("")
def list_notifications(
    db: DbSession,
    user: CurrentUser,
    unread_only: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
):
    """Newest first, plus the unread count for the bell badge."""
    stmt = (
        select(Notification)
        .options(joinedload(Notification.actor))
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    items = db.scalars(stmt).all()
    return {"items": [_out(n) for n in items], "unread_count": _unread(db, user.id)}


@router.get("/unread-count")
def unread_count(db: DbSession, user: CurrentUser):
    """Cheap call for polling the bell badge."""
    return {"unread_count": _unread(db, user.id)}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, db: DbSession, user: CurrentUser):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found.")
    n.is_read = True
    db.commit()
    return {"unread_count": _unread(db, user.id)}


@router.post("/read-all")
def mark_all_read(db: DbSession, user: CurrentUser, incident_id: int | None = None):
    """Mark everything read, or only the notifications about one incident."""
    stmt = update(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False))
    if incident_id is not None:
        stmt = stmt.where(Notification.incident_id == incident_id)
    db.execute(stmt.values(is_read=True))
    db.commit()
    return {"unread_count": _unread(db, user.id)}
