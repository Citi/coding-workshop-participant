"""Request bodies for Facility Admin management: facilities and engineers."""

from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field

from app.models import EngineerAvailability, IncidentCategory
from app.schemas.auth import RegisterIn


def _strip_required(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("This field is required.")
    return v


def _strip_optional(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


def _req(max_length: int):
    return Annotated[str, AfterValidator(_strip_required), Field(max_length=max_length)]


def _opt(max_length: int):
    # None skips validation entirely; blank strings become None after trimming.
    return Annotated[str, Field(max_length=max_length), AfterValidator(_strip_optional)] | None


Code = Annotated[str, AfterValidator(lambda v: _strip_required(v).upper()), Field(max_length=20)]


# ---------------------------------------------------------------- facilities

class BuildingCreate(BaseModel):
    code: Code
    name: _req(150)
    address: _opt(255) = None
    city: _opt(100) = None
    country: _opt(100) = None


class BuildingUpdate(BaseModel):
    code: Code | None = None
    name: _req(150) | None = None
    address: _opt(255) = None
    city: _opt(100) = None
    country: _opt(100) = None
    is_active: bool | None = None


class FloorCreate(BaseModel):
    building_id: int
    floor_number: int = Field(ge=-10, le=300)
    name: _opt(100) = None


class FloorUpdate(BaseModel):
    floor_number: int | None = Field(default=None, ge=-10, le=300)
    name: _opt(100) = None
    is_active: bool | None = None


class SeatCreate(BaseModel):
    floor_id: int
    seat_code: _req(30)
    description: _opt(255) = None


class SeatUpdate(BaseModel):
    seat_code: _req(30) | None = None
    description: _opt(255) = None
    is_active: bool | None = None


# ---------------------------------------------------------------- engineers

class EngineerCreate(RegisterIn):
    """Creates a user with role 'engineer' plus their engineer profile."""

    specializations: list[IncidentCategory] = Field(default_factory=list)
    availability: EngineerAvailability = EngineerAvailability.AVAILABLE
    max_active_tickets: int = Field(default=5, ge=1, le=50)
    home_building_id: int | None = None
    phone: _opt(30) = None
    department: _opt(100) = "Facilities"
    notes: _opt(2000) = None


class EngineerUpdate(BaseModel):
    name: _req(150) | None = None
    phone: _opt(30) = None
    department: _opt(100) = None
    specializations: list[IncidentCategory] | None = None
    availability: EngineerAvailability | None = None
    max_active_tickets: int | None = Field(default=None, ge=1, le=50)
    home_building_id: int | None = None
    notes: _opt(2000) = None
    is_active: bool | None = None


class AvailabilityUpdate(BaseModel):
    availability: EngineerAvailability
