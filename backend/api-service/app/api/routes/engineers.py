"""
Engineer profiles: Facility Admins create and manage engineers;
engineers keep their own availability up to date.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.core.security import hash_password
from app.models import ACTIVE_STATUSES, Building, EngineerProfile, Incident, User, UserRole
from app.schemas.admin import AvailabilityUpdate, EngineerCreate, EngineerUpdate

router = APIRouter(prefix="/engineers", tags=["engineers"])

_ENGINEER_SQL = """
    SELECT u.id, u.full_name AS name, u.email, u.phone, u.department, u.is_active,
           ep.availability::text, ep.specializations::text[] AS specializations,
           ep.max_active_tickets, ep.home_building_id, b.name AS home_building, ep.notes,
           COALESCE(w.active_tickets, 0) AS active_tickets,
           ep.max_active_tickets - COALESCE(w.active_tickets, 0) AS remaining_capacity
    FROM engineer_profiles ep
    JOIN users u ON u.id = ep.user_id
    LEFT JOIN buildings b ON b.id = ep.home_building_id
    LEFT JOIN engineer_workload w ON w.engineer_id = ep.user_id
"""


def _engineers(db: Session, where: str = "TRUE", params: dict | None = None) -> list[dict]:
    rows = db.execute(text(f"{_ENGINEER_SQL} WHERE {where} ORDER BY u.full_name"), params or {})
    return [dict(r) for r in rows.mappings()]


def _engineer_or_404(db: Session, engineer_id: int) -> dict:
    rows = _engineers(db, "ep.user_id = :id", {"id": engineer_id})
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Engineer not found.")
    return rows[0]


def _check_building(db: Session, building_id: int | None):
    if building_id is not None and db.get(Building, building_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Home building not found.")


@router.get("")
def list_engineers(db: DbSession, _user: AdminUser, include_inactive: bool = False):
    """Engineers with profile and live workload (admin only)."""
    return _engineers(db, "TRUE" if include_inactive else "u.is_active")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_engineer(body: EngineerCreate, db: DbSession, admin: AdminUser):
    """Create an engineer account (user + profile). Share the initial password with them."""
    _check_building(db, body.home_building_id)
    user = User(
        full_name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole.ENGINEER,
        phone=body.phone,
        department=body.department,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.") from exc

    db.add(EngineerProfile(
        user_id=user.id,
        specializations=list(dict.fromkeys(body.specializations)),
        availability=body.availability,
        max_active_tickets=body.max_active_tickets,
        home_building_id=body.home_building_id,
        notes=body.notes,
        created_by_id=admin.id,
    ))
    db.commit()
    return _engineer_or_404(db, user.id)


@router.patch("/me/availability")
def update_my_availability(body: AvailabilityUpdate, db: DbSession, user: CurrentUser):
    """Engineers set their own availability (available / busy / on_leave / offline)."""
    profile = db.get(EngineerProfile, user.id)
    if not user.is_engineer or profile is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only engineers have an availability status.")
    profile.availability = body.availability
    db.commit()
    return _engineer_or_404(db, user.id)


@router.get("/{engineer_id}")
def get_engineer(engineer_id: int, db: DbSession, _user: AdminUser):
    return _engineer_or_404(db, engineer_id)


@router.patch("/{engineer_id}")
def update_engineer(engineer_id: int, body: EngineerUpdate, db: DbSession, admin: AdminUser):
    """Update an engineer's profile, capacity, availability or deactivate the account."""
    profile = db.get(EngineerProfile, engineer_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Engineer not found.")
    user = db.get(User, engineer_id)
    changes = body.model_dump(exclude_unset=True)

    for k in ("name", "specializations", "availability", "max_active_tickets", "is_active"):
        if k in changes and changes[k] is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{k} cannot be cleared.")
    if "home_building_id" in changes:
        _check_building(db, changes["home_building_id"])
    if user.id == admin.id and changes.get("is_active") is False:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't deactivate yourself.")
    if changes.get("is_active") is False:
        active = db.scalar(
            select(func.count()).select_from(Incident).where(
                Incident.assigned_engineer_id == engineer_id, Incident.status.in_(ACTIVE_STATUSES)
            )
        )
        if active:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"{user.full_name} still has {active} active ticket(s). Reassign them first.",
            )

    user_fields = {"name": "full_name", "phone": "phone", "department": "department", "is_active": "is_active"}
    for k, v in changes.items():
        if k in user_fields:
            setattr(user, user_fields[k], v)
        elif k == "specializations":
            profile.specializations = list(dict.fromkeys(v))
        else:
            setattr(profile, k, v)
    db.commit()
    return _engineer_or_404(db, engineer_id)
