"""
Facilities: everyone can read the active tree (for location pickers);
Facility Admins define buildings, floors and seats.

Deleting is only allowed while nothing references the item (no incidents,
no engineer home building); otherwise deactivate it with is_active=false.
"""

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.models import Building, Floor, Seat
from app.schemas.admin import (
    BuildingCreate, BuildingUpdate, FloorCreate, FloorUpdate, SeatCreate, SeatUpdate,
)

router = APIRouter(tags=["facilities"])


def _building_out(b: Building, include_inactive: bool) -> dict:
    return {
        "id": b.id,
        "code": b.code,
        "name": b.name,
        "address": b.address,
        "city": b.city,
        "country": b.country,
        "is_active": b.is_active,
        "floors": [
            _floor_out(f, include_inactive) for f in b.floors if include_inactive or f.is_active
        ],
    }


def _floor_out(f: Floor, include_inactive: bool = True) -> dict:
    return {
        "id": f.id,
        "building_id": f.building_id,
        "floor_number": f.floor_number,
        "name": f.name,
        "is_active": f.is_active,
        "seats": [_seat_out(s) for s in f.seats if include_inactive or s.is_active],
    }


def _seat_out(s: Seat) -> dict:
    return {
        "id": s.id,
        "floor_id": s.floor_id,
        "seat_code": s.seat_code,
        "description": s.description,
        "is_active": s.is_active,
    }


def _save(db: Session, conflict_msg: str):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, conflict_msg) from exc


def _delete(db: Session, stmt, in_use_msg: str):
    try:
        db.execute(stmt)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, in_use_msg) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _get_or_404(db: Session, model, obj_id: int, label: str):
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} not found.")
    return obj


# ---------------------------------------------------------------- read

@router.get("/facilities")
def list_facilities(
    db: DbSession,
    user: CurrentUser,
    include_inactive: bool = Query(default=False, description="Admins only: include deactivated items"),
):
    """Buildings → floors → seats. Non-admins always get active items only."""
    include_inactive = include_inactive and user.is_admin
    stmt = select(Building).options(selectinload(Building.floors).selectinload(Floor.seats))
    if not include_inactive:
        stmt = stmt.where(Building.is_active)
    buildings = db.scalars(stmt.order_by(Building.name)).all()
    return [_building_out(b, include_inactive) for b in buildings]


# ---------------------------------------------------------------- buildings

@router.post("/buildings", status_code=status.HTTP_201_CREATED)
def create_building(body: BuildingCreate, db: DbSession, user: AdminUser):
    b = Building(**body.model_dump(), created_by_id=user.id)
    db.add(b)
    _save(db, "A building with this code or name already exists.")
    db.refresh(b, ["floors"])
    return _building_out(b, True)


@router.patch("/buildings/{building_id}")
def update_building(building_id: int, body: BuildingUpdate, db: DbSession, _user: AdminUser):
    b = _get_or_404(db, Building, building_id, "Building")
    changes = body.model_dump(exclude_unset=True)
    if any(changes.get(k) is None and k in changes for k in ("code", "name", "is_active")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code, name and is_active cannot be cleared.")
    for k, v in changes.items():
        setattr(b, k, v)
    _save(db, "A building with this code or name already exists.")
    db.refresh(b, ["floors"])
    return _building_out(b, True)


@router.delete("/buildings/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_building(building_id: int, db: DbSession, _user: AdminUser):
    _get_or_404(db, Building, building_id, "Building")
    return _delete(
        db,
        delete(Building).where(Building.id == building_id),
        "This building is referenced by incidents or engineer profiles. Deactivate it instead.",
    )


# ---------------------------------------------------------------- floors

@router.post("/floors", status_code=status.HTTP_201_CREATED)
def create_floor(body: FloorCreate, db: DbSession, _user: AdminUser):
    _get_or_404(db, Building, body.building_id, "Building")
    f = Floor(**body.model_dump())
    db.add(f)
    _save(db, "That floor number already exists in this building.")
    db.refresh(f, ["seats"])
    return _floor_out(f)


@router.patch("/floors/{floor_id}")
def update_floor(floor_id: int, body: FloorUpdate, db: DbSession, _user: AdminUser):
    f = _get_or_404(db, Floor, floor_id, "Floor")
    changes = body.model_dump(exclude_unset=True)
    if any(changes.get(k) is None and k in changes for k in ("floor_number", "is_active")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Floor number and is_active cannot be cleared.")
    for k, v in changes.items():
        setattr(f, k, v)
    _save(db, "That floor number already exists in this building.")
    db.refresh(f, ["seats"])
    return _floor_out(f)


@router.delete("/floors/{floor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_floor(floor_id: int, db: DbSession, _user: AdminUser):
    _get_or_404(db, Floor, floor_id, "Floor")
    return _delete(
        db,
        delete(Floor).where(Floor.id == floor_id),
        "This floor is referenced by incidents. Deactivate it instead.",
    )


# ---------------------------------------------------------------- seats

@router.post("/seats", status_code=status.HTTP_201_CREATED)
def create_seat(body: SeatCreate, db: DbSession, _user: AdminUser):
    _get_or_404(db, Floor, body.floor_id, "Floor")
    s = Seat(**body.model_dump())
    db.add(s)
    _save(db, "That seat code already exists on this floor.")
    return _seat_out(s)


@router.patch("/seats/{seat_id}")
def update_seat(seat_id: int, body: SeatUpdate, db: DbSession, _user: AdminUser):
    s = _get_or_404(db, Seat, seat_id, "Seat")
    changes = body.model_dump(exclude_unset=True)
    if any(changes.get(k) is None and k in changes for k in ("seat_code", "is_active")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Seat code and is_active cannot be cleared.")
    for k, v in changes.items():
        setattr(s, k, v)
    _save(db, "That seat code already exists on this floor.")
    return _seat_out(s)


@router.delete("/seats/{seat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_seat(seat_id: int, db: DbSession, _user: AdminUser):
    _get_or_404(db, Seat, seat_id, "Seat")
    return _delete(
        db,
        delete(Seat).where(Seat.id == seat_id),
        "This seat is referenced by incidents. Deactivate it instead.",
    )
