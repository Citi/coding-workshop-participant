"""Role-specific dashboard summaries."""

from fastapi import APIRouter
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.models import FINAL_STATUSES, Incident, IncidentStatus as S, User
from app.services import incidents as svc

router = APIRouter(tags=["dashboard"])

CLOSED_OR_RESOLVED = FINAL_STATUSES | {S.RESOLVED}


def _status_counts(db: Session, *where) -> dict[str, int]:
    rows = db.execute(
        select(Incident.status, func.count()).where(*where).group_by(Incident.status)
    ).all()
    return {status.value: n for status, n in rows}


def _incidents(db: Session, *where, order_by, limit=20) -> list[dict]:
    rows = db.scalars(
        select(Incident).options(*svc.SUMMARY_OPTIONS).where(*where).order_by(*order_by).limit(limit)
    ).all()
    return [svc.summary(i) for i in rows]


def _employee(db: Session, user: User) -> dict:
    mine = Incident.reported_by_id == user.id
    return {
        "status_counts": _status_counts(db, mine),
        "incidents": _incidents(db, mine, order_by=[Incident.updated_at.desc()]),
    }


def _engineer(db: Session, user: User) -> dict:
    mine = Incident.assigned_engineer_id == user.id
    profile = db.execute(
        text("""
            SELECT availability::text, max_active_tickets, active_tickets, remaining_capacity,
                   specializations::text[] AS specializations
            FROM engineer_workload WHERE engineer_id = :uid
        """),
        {"uid": user.id},
    ).mappings().first()
    return {
        "profile": dict(profile) if profile else None,
        "status_counts": _status_counts(db, mine),
        "incidents": _incidents(
            db,
            mine,
            Incident.status.notin_(FINAL_STATUSES),
            order_by=[Incident.status == S.RESOLVED, Incident.priority.desc(), Incident.created_at],
        ),
    }


def _admin(db: Session, _user: User) -> dict:
    active = Incident.status.notin_(CLOSED_OR_RESOLVED)
    unassigned = and_(Incident.status == S.OPEN, Incident.assigned_engineer_id.is_(None))
    attention = db.execute(
        select(
            func.count().filter(unassigned).label("unassigned"),
            func.count().filter(Incident.is_escalated, active).label("escalated"),
            func.count().filter(Incident.requested_priority > Incident.priority, active).label("priority_requests"),
            func.count().filter(Incident.status == S.RESOLVED).label("awaiting_closure"),
        )
    ).mappings().one()
    facilities = db.execute(
        text("""
            SELECT (SELECT count(*) FROM buildings WHERE is_active) AS buildings,
                   (SELECT count(*) FROM floors    WHERE is_active) AS floors,
                   (SELECT count(*) FROM seats     WHERE is_active) AS seats
        """)
    ).mappings().one()
    engineers = db.execute(
        text("""
            SELECT engineer_id AS id, full_name AS name, availability::text,
                   specializations::text[] AS specializations,
                   active_tickets, max_active_tickets, remaining_capacity
            FROM engineer_workload ORDER BY full_name
        """)
    ).mappings().all()
    return {
        "status_counts": _status_counts(db),
        "attention": dict(attention),
        "facilities": dict(facilities),
        "engineers": [dict(e) for e in engineers],
        "needs_attention": _incidents(
            db,
            or_(unassigned, and_(Incident.is_escalated, active), Incident.status == S.RESOLVED),
            order_by=[Incident.is_escalated.desc(), Incident.priority.desc(), Incident.created_at],
        ),
        "incidents": _incidents(db, order_by=[Incident.updated_at.desc()], limit=10),
    }


_BUILDERS = {"employee": _employee, "engineer": _engineer, "facility_admin": _admin}


@router.get("/dashboard")
def dashboard(db: DbSession, user: CurrentUser):
    """Summary tailored to the caller's role."""
    data = _BUILDERS[user.role.value](db, user)
    data["role"] = user.role.value
    return data

