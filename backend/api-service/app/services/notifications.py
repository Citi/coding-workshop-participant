"""
In-app notifications: who hears about which change.

Called by the incident routes inside the same transaction as the change, so
a notification exists exactly when the change it describes was committed.
The person who made the change is never notified about it.

Recipients
----------
stakeholders(inc)   reporter + assigned engineer; all admins while unassigned
staff(inc)          assigned engineer + all admins (never the employee)
admins()            every active Facility Admin
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Incident, User, UserRole
from app.models.notification import Notification

STATUS_TEXT = {
    "open": "Open",
    "assigned": "Assigned",
    "in_progress": "In progress",
    "on_hold": "On hold",
    "resolved": "Resolved",
    "closed": "Closed",
    "cancelled": "Cancelled",
}


def _short(text: str, limit: int = 80) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def admin_ids(db: Session) -> set[int]:
    return set(
        db.scalars(select(User.id).where(User.role == UserRole.FACILITY_ADMIN, User.is_active)).all()
    )


def stakeholders(db: Session, inc: Incident) -> set[int]:
    ids = {inc.reported_by_id}
    if inc.assigned_engineer_id:
        ids.add(inc.assigned_engineer_id)
    else:
        ids |= admin_ids(db)
    return ids


def staff(db: Session, inc: Incident) -> set[int]:
    ids = admin_ids(db)
    if inc.assigned_engineer_id:
        ids.add(inc.assigned_engineer_id)
    return ids


def notify(db: Session, recipients, *, actor: User, kind: str, message: str,
           incident: Incident | None, link: bool = True) -> int:
    """Queue one notification per recipient (minus the actor). Returns how many.
    link=False keeps the reference text but no incident_id (used for deletions)."""
    targets = {uid for uid in recipients if uid and uid != actor.id}
    for uid in targets:
        db.add(Notification(
            user_id=uid,
            actor_id=actor.id,
            kind=kind,
            message=message[:500],
            incident_id=incident.id if incident is not None and link else None,
            incident_ref=incident.reference if incident is not None else None,
        ))
    return len(targets)


# ------------------------------------------------------------------ events

def incident_created(db, inc: Incident, actor: User):
    notify(db, admin_ids(db), actor=actor, kind="incident_created", incident=inc,
           message=f"{actor.full_name} reported {inc.reference}: {_short(inc.title)}")


def details_updated(db, inc: Incident, actor: User, fields: list[str]):
    what = ", ".join(f.replace("_id", "").replace("_", " ") for f in fields)
    notify(db, stakeholders(db, inc), actor=actor, kind="details_updated", incident=inc,
           message=f"{actor.full_name} updated {what} on {inc.reference}")


def priority_changed(db, inc: Incident, actor: User, old: str, new: str):
    notify(db, stakeholders(db, inc), actor=actor, kind="priority_changed", incident=inc,
           message=f"{actor.full_name} changed the priority of {inc.reference} from {old.title()} to {new.title()}")


def escalation_cleared(db, inc: Incident, actor: User):
    notify(db, {inc.reported_by_id}, actor=actor, kind="escalation_cleared", incident=inc,
           message=f"{actor.full_name} reviewed and cleared the escalation on {inc.reference}")


def status_changed(db, inc: Incident, actor: User, old: str, new: str):
    message = f"{actor.full_name} moved {inc.reference} from {STATUS_TEXT[old]} to {STATUS_TEXT[new]}"
    if new == "resolved":
        message += ". Please confirm the fix or reopen it"
    notify(db, stakeholders(db, inc), actor=actor, kind="status_changed", incident=inc, message=message)


def assigned(db, inc: Incident, actor: User, engineer: User, previous_id: int | None):
    title = _short(inc.title)
    notify(db, {engineer.id}, actor=actor, kind="assigned", incident=inc,
           message=f"{actor.full_name} assigned {inc.reference} to you: {title}")
    notify(db, {inc.reported_by_id} - {engineer.id}, actor=actor, kind="assigned", incident=inc,
           message=f"{engineer.full_name} is now working on your incident {inc.reference}")
    if previous_id and previous_id != engineer.id:
        notify(db, {previous_id}, actor=actor, kind="unassigned", incident=inc,
               message=f"{actor.full_name} reassigned {inc.reference} to {engineer.full_name}")


def escalated(db, inc: Incident, actor: User, requested: str | None):
    message = f"{actor.full_name} escalated {inc.reference}"
    if requested:
        message += f" and requested {requested.title()} priority"
    notify(db, staff(db, inc), actor=actor, kind="escalated", incident=inc, message=message)


def note_added(db, inc: Incident, actor: User, body: str, internal: bool):
    recipients = staff(db, inc) if internal else stakeholders(db, inc)
    label = "an internal note" if internal else "a note"
    notify(db, recipients, actor=actor, kind="note_added", incident=inc,
           message=f'{actor.full_name} added {label} on {inc.reference}: "{_short(body, 120)}"')


def incident_deleted(db, inc: Incident, actor: User):
    recipients = {inc.reported_by_id, inc.assigned_engineer_id}
    notify(db, recipients, actor=actor, kind="incident_deleted", incident=inc, link=False,
           message=f"{actor.full_name} deleted {inc.reference}: {_short(inc.title)}")
