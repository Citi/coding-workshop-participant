"""Query helpers and response builders for incidents."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import Building, Floor, Incident, IncidentHistory, IncidentNote, Seat, User
from app.services import permissions as perms

# Eager-load everything a summary row needs in one round trip
SUMMARY_OPTIONS = (
    joinedload(Incident.building),
    joinedload(Incident.floor),
    joinedload(Incident.seat),
    joinedload(Incident.reporter),
    joinedload(Incident.engineer),
)


def summary(inc: Incident) -> dict:
    return {
        "id": inc.id,
        "reference": inc.reference,
        "title": inc.title,
        "category": inc.category,
        "priority": inc.priority,
        "status": inc.status,
        "requested_priority": inc.requested_priority,
        "is_escalated": inc.is_escalated,
        "created_at": inc.created_at,
        "updated_at": inc.updated_at,
        "building": inc.building.name,
        "floor": inc.floor.name if inc.floor else None,
        "seat": inc.seat.seat_code if inc.seat else None,
        "location_details": inc.location_details,
        "reported_by": inc.reporter.full_name,
        "assigned_engineer": inc.engineer.full_name if inc.engineer else None,
    }


def get_incident_or_404(db: Session, incident_id: int, user: User) -> Incident:
    inc = db.scalar(
        select(Incident)
        .options(
            *SUMMARY_OPTIONS,
            selectinload(Incident.notes).joinedload(IncidentNote.author),
            selectinload(Incident.history).joinedload(IncidentHistory.actor),
        )
        .where(Incident.id == incident_id)
    )
    # Same 404 whether it doesn't exist or the user may not see it
    if inc is None or not perms.can_view(user, inc):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found.")
    return inc


def detail(db: Session, inc: Incident, user: User) -> dict:
    show_internal = perms.can_see_internal_notes(user)
    notes = [
        {
            "id": n.id,
            "body": n.body,
            "is_internal": n.is_internal,
            "created_at": n.created_at,
            "author_id": n.author_id,
            "author_name": n.author.full_name,
            "author_role": n.author.role,
        }
        for n in inc.notes
        if show_internal or not n.is_internal
    ]

    # Assignment history stores engineer ids; show names instead
    engineer_ids = {
        int(v)
        for h in inc.history
        if h.event_type == "assignment"
        for v in (h.from_value, h.to_value)
        if v and v.isdigit()
    }
    names = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(engineer_ids))).all())
        if engineer_ids
        else {}
    )

    def display(event_type, value):
        if value and event_type == "assignment" and value.isdigit():
            return names.get(int(value), f"User #{value}")
        return value

    history = [
        {
            "id": h.id,
            "event_type": h.event_type,
            "from_value": display(h.event_type, h.from_value),
            "to_value": display(h.event_type, h.to_value),
            "comment": h.comment,
            "changed_by": h.actor.full_name if h.actor else None,
            "created_at": h.created_at,
        }
        for h in inc.history
    ]

    return {
        **summary(inc),
        "description": inc.description,
        "building_id": inc.building_id,
        "floor_id": inc.floor_id,
        "seat_id": inc.seat_id,
        "reported_by_id": inc.reported_by_id,
        "assigned_engineer_id": inc.assigned_engineer_id,
        "assigned_at": inc.assigned_at,
        "escalation_reason": inc.escalation_reason,
        "escalated_at": inc.escalated_at,
        "resolved_at": inc.resolved_at,
        "closed_at": inc.closed_at,
        "notes": notes,
        "history": history,
        "permissions": perms.permissions(user, inc),
    }


def validate_location(db: Session, building_id: int, floor_id: int | None, seat_id: int | None) -> None:
    """Friendly 400s for location mismatches (the DB also enforces these)."""
    if seat_id is not None and floor_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a floor when choosing a seat.")
    building = db.get(Building, building_id)
    if building is None or not building.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That building doesn't exist or is no longer in use.")
    if floor_id is not None:
        floor = db.get(Floor, floor_id)
        if floor is None or floor.building_id != building_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That floor is not in the selected building.")
        if not floor.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That floor is no longer in use.")
    if seat_id is not None:
        seat = db.get(Seat, seat_id)
        if seat is None or seat.floor_id != floor_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That seat is not on the selected floor.")
        if not seat.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That seat is no longer in use.")
