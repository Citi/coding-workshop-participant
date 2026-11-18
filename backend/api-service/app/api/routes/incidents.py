"""Incident CRUD plus workflow actions, with role-based authorization."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.models import (
    EngineerAvailability, EngineerProfile, Incident, IncidentNote, IncidentPriority, IncidentStatus as S, User,
)
from app.schemas.incident import (
    AssignIn, EscalateIn, IncidentCreate, IncidentDetail, IncidentList, IncidentUpdate,
    NoteCreate, StatusChange,
)
from app.services import incidents as svc
from app.services import permissions as perms

router = APIRouter(prefix="/incidents", tags=["incidents"])

# Engineers who can't receive new assignments ('busy' is allowed - admin's call)
UNASSIGNABLE = {EngineerAvailability.ON_LEAVE, EngineerAvailability.OFFLINE}


def _now():
    return datetime.now(timezone.utc)


def _commit(db):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That change isn't valid for this incident.") from exc


def _reload(db, incident_id, user) -> dict:
    db.expire_all()
    return svc.detail(db, svc.get_incident_or_404(db, incident_id, user), user)


# ------------------------------------------------------------------ CRUD

@router.get("", response_model=IncidentList)
def list_incidents(
    db: DbSession,
    user: CurrentUser,
    status_: list[S] | None = Query(default=None, alias="status"),
    priority: list[IncidentPriority] | None = Query(default=None),
    escalated: bool | None = None,
    unassigned: bool | None = None,
    q: str | None = Query(default=None, max_length=100, description="Search title / reference"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Incidents visible to the caller: own (employee), assigned (engineer) or all (admin)."""
    where = [perms.visibility_filter(user)]
    if status_:
        where.append(Incident.status.in_(status_))
    if priority:
        where.append(Incident.priority.in_(priority))
    if escalated is not None:
        where.append(Incident.is_escalated.is_(escalated))
    if unassigned:
        where.append(Incident.assigned_engineer_id.is_(None))
    if q:
        like = f"%{q.strip()}%"
        where.append(Incident.title.ilike(like) | Incident.reference.ilike(like))

    total = db.scalar(select(func.count()).select_from(Incident).where(*where))
    rows = db.scalars(
        select(Incident)
        .options(*svc.SUMMARY_OPTIONS)
        .where(*where)
        .order_by(Incident.updated_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return {"items": [svc.summary(i) for i in rows], "total": total}


@router.post("", response_model=IncidentDetail, status_code=status.HTTP_201_CREATED)
def create_incident(body: IncidentCreate, db: DbSession, user: CurrentUser):
    """Report a new incident. Only admins may open one as 'critical'."""
    if body.priority == IncidentPriority.CRITICAL and not user.is_admin:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Choose low, medium or high. Use escalation to request critical priority.",
        )
    svc.validate_location(db, body.building_id, body.floor_id, body.seat_id)
    inc = Incident(**body.model_dump(), reported_by_id=user.id)
    db.add(inc)
    _commit(db)
    return _reload(db, inc.id, user)


@router.get("/{incident_id}", response_model=IncidentDetail)
def get_incident(incident_id: int, db: DbSession, user: CurrentUser):
    """Full incident with notes, history and the caller's allowed actions."""
    inc = svc.get_incident_or_404(db, incident_id, user)
    return svc.detail(db, inc, user)


@router.patch("/{incident_id}", response_model=IncidentDetail)
def update_incident(incident_id: int, body: IncidentUpdate, db: DbSession, user: CurrentUser):
    """Edit details. Reporter: while 'open'. Admin: any time, incl. priority / de-escalation."""
    inc = svc.get_incident_or_404(db, incident_id, user)
    changes = body.model_dump(exclude_unset=True)

    admin_only = {"priority", "is_escalated"} & changes.keys()
    if admin_only and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Only a Facility Admin can change: {', '.join(sorted(admin_only))}.")
    if not perms.can_edit(user, inc):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This incident can no longer be edited.")
    if changes.get("is_escalated") is True:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use the escalate action to escalate.")
    if any(changes.get(k) is None and k in changes for k in ("title", "description", "category", "building_id", "priority", "is_escalated")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Required fields cannot be cleared.")

    if {"building_id", "floor_id", "seat_id"} & changes.keys():
        building_id = changes.get("building_id", inc.building_id)
        floor_id = changes["floor_id"] if "floor_id" in changes else inc.floor_id
        seat_id = changes["seat_id"] if "seat_id" in changes else inc.seat_id
        svc.validate_location(db, building_id, floor_id, seat_id)

    for field, value in changes.items():
        setattr(inc, field, value)
    if changes.get("is_escalated") is False:
        inc.escalated_at = None
    _commit(db)
    return _reload(db, incident_id, user)


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_incident(incident_id: int, db: DbSession, user: AdminUser):
    """Permanently delete an incident with its notes and history (admin only)."""
    inc = svc.get_incident_or_404(db, incident_id, user)
    db.delete(inc)
    _commit(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------------ workflow

@router.post("/{incident_id}/status", response_model=IncidentDetail)
def change_status(incident_id: int, body: StatusChange, db: DbSession, user: CurrentUser):
    """Move the incident through its lifecycle (allowed moves depend on role)."""
    inc = svc.get_incident_or_404(db, incident_id, user)
    if body.status not in perms.allowed_transitions(user, inc):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"You can't change this incident from {inc.status.value} to {body.status.value}.",
        )

    inc.status = body.status
    if body.status == S.RESOLVED:
        inc.resolved_at = _now()
    elif body.status == S.CLOSED:
        inc.closed_at = _now()
    elif body.status in (S.IN_PROGRESS, S.ASSIGNED, S.OPEN, S.ON_HOLD):
        inc.resolved_at = None
        inc.closed_at = None

    if body.comment and body.comment.strip():
        db.add(IncidentNote(incident_id=inc.id, author_id=user.id, body=body.comment.strip()))
    _commit(db)
    return _reload(db, incident_id, user)


@router.post("/{incident_id}/assign", response_model=IncidentDetail)
def assign_engineer(incident_id: int, body: AssignIn, db: DbSession, user: AdminUser):
    """Assign or reassign an engineer (admin only)."""
    inc = svc.get_incident_or_404(db, incident_id, user)
    if inc.status in (S.CLOSED, S.CANCELLED):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Closed or cancelled incidents can't be assigned.")
    profile = db.get(EngineerProfile, body.engineer_id)
    engineer = db.get(User, body.engineer_id)
    if profile is None or engineer is None or not engineer.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That engineer doesn't exist or is inactive.")
    if profile.availability in UNASSIGNABLE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{engineer.full_name} is {profile.availability.value.replace('_', ' ')} and can't take new tickets.",
        )

    inc.assigned_engineer_id = profile.user_id
    inc.assigned_by_id = user.id
    inc.assigned_at = _now()
    if inc.status == S.OPEN:
        inc.status = S.ASSIGNED
    _commit(db)
    return _reload(db, incident_id, user)


@router.post("/{incident_id}/escalate", response_model=IncidentDetail)
def escalate(incident_id: int, body: EscalateIn, db: DbSession, user: CurrentUser):
    """Reporter escalates the incident and may request a higher priority."""
    inc = svc.get_incident_or_404(db, incident_id, user)
    if not perms.can_escalate(user, inc):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This incident can't be escalated.")
    if body.requested_priority and body.requested_priority.rank <= inc.priority.rank:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Requested priority must be higher than the current one.")

    inc.is_escalated = True
    inc.escalated_at = _now()
    inc.escalation_reason = body.reason
    if body.requested_priority:
        inc.requested_priority = body.requested_priority
    _commit(db)
    return _reload(db, incident_id, user)


@router.post("/{incident_id}/notes", response_model=IncidentDetail, status_code=status.HTTP_201_CREATED)
def add_note(incident_id: int, body: NoteCreate, db: DbSession, user: CurrentUser):
    """Add a note. Internal notes (hidden from employees) are for engineers and admins."""
    inc = svc.get_incident_or_404(db, incident_id, user)
    if not perms.can_add_note(user, inc):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Notes can only be added to open incidents.")
    if body.is_internal and not perms.can_add_internal_note(user, inc):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only engineers and admins can add internal notes.")
    db.add(IncidentNote(incident_id=inc.id, author_id=user.id, body=body.body, is_internal=body.is_internal))
    _commit(db)
    return _reload(db, incident_id, user)
