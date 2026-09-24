"""Pydantic request and response models. Shape and format validation only; FastAPI returns 422."""

import re
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

# These mirror the CHECK constraints in sql/schema.sql, and Role mirrors the rows seeded
# into its roles table. Ticket priority (P1-P3) is stored for engineer/admin triage but is
# deliberately not part of any employee model; only the staff (Admin*) models carry it,
# which engineers use too.
Role = Literal["employee", "engineer", "admin"]
Priority = Literal["P1", "P2", "P3"]
Category = Literal[
    "network", "hardware", "printer", "hvac",
    "electrical", "furniture", "building_facilities", "other",
]
AffectedScope = Literal["me", "floor", "building"]
TicketStatus = Literal["open", "in_progress", "blocked", "resolved", "closed"]

# Postgres INTEGER max. Ids above this are rejected up front instead of erroring in the DB.
MAX_DB_ID = 2_147_483_647
DbId = Annotated[int, Field(ge=1, le=MAX_DB_ID)]

ACME_EMAIL = re.compile(r"[^@\s]+@acme\.inc")

TrimmedText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def _normalize_email(value: str) -> str:
    """Trim and lowercase an email so lookups and uniqueness ignore case."""
    return value.strip().lower()


class RegisterRequest(BaseModel):
    """New employee account. The role is always 'employee'; admins promote users later."""

    email: Annotated[str, StringConstraints(max_length=254)]
    full_name: Annotated[TrimmedText, StringConstraints(max_length=100)]
    phone_number: Annotated[TrimmedText, StringConstraints(max_length=30)] | None = None
    password: Annotated[str, StringConstraints(min_length=8, max_length=128)]

    @field_validator("email")
    @classmethod
    def email_must_be_acme(cls, value: str) -> str:
        """Only company addresses can register."""
        email = _normalize_email(value)
        if not ACME_EMAIL.fullmatch(email):
            raise ValueError("Email must be an @acme.inc address")
        return email


class LoginRequest(BaseModel):
    """Email and password. No domain check here: an unknown email is just a failed login."""

    email: Annotated[str, StringConstraints(max_length=254)]
    password: Annotated[str, StringConstraints(max_length=128)]

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        """Match how emails were stored at registration."""
        return _normalize_email(value)


class UserResponse(BaseModel):
    """A user as the API returns it. Never includes the password hash."""

    user_id: int
    email: str
    full_name: str
    phone_number: str | None
    role: Role
    created_at: datetime


class LoginResponse(BaseModel):
    """A signed access token plus the signed-in user. Send the token as `Authorization: Bearer <token>`."""

    access_token: str
    token_type: Literal["bearer"]
    expires_in: int
    user: UserResponse


class BuildingResponse(BaseModel):
    """A building, for the location dropdowns."""

    building_id: int
    building_name: str


class FloorResponse(BaseModel):
    """A floor within a building."""

    floor_id: int
    floor_number: int
    building_id: int


class SeatResponse(BaseModel):
    """A seat within a floor."""

    seat_id: int
    seat_number: str
    floor_id: int


class TicketCreate(BaseModel):
    """A new ticket from an employee. Status, creator and the internal priority are set by the server."""

    title: Annotated[TrimmedText, StringConstraints(max_length=150)]
    description: Annotated[TrimmedText, StringConstraints(max_length=5000)]
    category: Category
    affected_scope: AffectedScope
    building_id: DbId
    floor_id: DbId | None = None
    seat_id: DbId | None = None

    @model_validator(mode="after")
    def location_matches_scope(self) -> Self:
        """Require at least the location levels the scope implies. Extra detail is allowed."""
        if self.seat_id is not None and self.floor_id is None:
            raise ValueError("A seat_id requires a floor_id")
        if self.affected_scope == "floor" and self.floor_id is None:
            raise ValueError("Floor-wide issues need a floor_id")
        if self.affected_scope == "me" and self.seat_id is None:
            raise ValueError("Issues affecting only you need a floor_id and seat_id")
        return self


class TicketFilters(BaseModel):
    """Query parameters for the my-tickets list. All optional; they combine with AND.

    Unknown parameters (including priority, which employees can't filter by) are a 422.
    """

    model_config = ConfigDict(extra="forbid")

    status: TicketStatus | None = None
    # "active" is everything not closed, so resolved tickets awaiting closure still show.
    view: Literal["active", "closed"] | None = None
    q: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None


class TicketListItem(BaseModel):
    """A ticket summary for the employee's list, with location names filled in."""

    ticket_id: int
    title: str
    category: Category
    status: TicketStatus
    affected_scope: AffectedScope
    escalation_requested: bool
    building_id: int
    building_name: str
    floor_id: int | None
    floor_number: int | None
    seat_id: int | None
    seat_number: str | None
    created_at: datetime
    updated_at: datetime


class TicketResponse(BaseModel):
    """A ticket as its employee sees it: everything stored except the internal priority."""

    ticket_id: int
    title: str
    description: str
    category: Category
    affected_scope: AffectedScope
    status: TicketStatus
    building_id: int
    floor_id: int | None
    seat_id: int | None
    created_by_user_id: int
    assigned_to_user_id: int | None
    escalation_requested: bool
    escalation_reason: str | None
    blocked_reason: str | None
    created_at: datetime
    updated_at: datetime
    acknowledged_at: datetime | None
    assigned_at: datetime | None
    resolved_at: datetime | None


class NoteCreate(BaseModel):
    """A note added to a ticket's history."""

    note_text: Annotated[TrimmedText, StringConstraints(max_length=2000)]


class NoteResponse(BaseModel):
    """A note with its author, so the history can show who wrote what."""

    note_id: int
    ticket_id: int
    user_id: int
    author_name: str
    author_role: Role
    note_text: str
    created_at: datetime


class StatusChangeResponse(BaseModel):
    """One step in a ticket's status history. from_status is None on the creation row."""

    history_id: int
    ticket_id: int
    from_status: TicketStatus | None
    to_status: TicketStatus
    changed_by_user_id: int
    changed_by_name: str
    changed_by_role: Role
    reason: str | None
    changed_at: datetime


class EscalationRequest(BaseModel):
    """Why the employee thinks the ticket needs more attention."""

    reason: Annotated[TrimmedText, StringConstraints(max_length=1000)]


class TicketDetail(TicketResponse):
    """A full ticket plus the names a details page shows."""

    building_name: str
    floor_number: int | None
    seat_number: str | None
    assigned_to_name: str | None


# --- Facility Admin -----------------------------------------------------------


class AdminTicketFilters(BaseModel):
    """Query parameters for the admin's all-tickets list. All optional; they combine with AND.

    `assignment=unassigned` is the dashboard's "needs an engineer" view. Unknown parameters are a 422.
    """

    model_config = ConfigDict(extra="forbid")

    status: TicketStatus | None = None
    priority: Priority | None = None
    category: Category | None = None
    building_id: DbId | None = None
    assignment: Literal["unassigned", "assigned"] | None = None
    assigned_to: DbId | None = None
    escalated: bool | None = None
    # Same meaning as the employee list: "active" is everything not closed.
    view: Literal["active", "closed"] | None = None
    # Also matches the requester's name or email, which employees' own search doesn't need.
    q: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None


class AdminTicketListItem(TicketListItem):
    """A row in the admin's all-tickets list: the employee summary plus triage fields."""

    priority: Priority
    created_by_user_id: int
    created_by_name: str
    assigned_to_user_id: int | None
    assigned_to_name: str | None


class AdminTicketDetail(TicketDetail):
    """A full ticket as a Facility Admin sees it: priority and how to reach the requester."""

    priority: Priority
    created_by_name: str
    created_by_email: str
    created_by_phone: str | None


class AssignmentRequest(BaseModel):
    """Which engineer should own the ticket. Must be a user whose role is 'engineer'."""

    engineer_id: DbId


class UserFilters(BaseModel):
    """Query parameters for the admin's people list. Both optional; unknown parameters are a 422."""

    model_config = ConfigDict(extra="forbid")

    role: Role | None = None
    # Case-insensitive match on name or email.
    q: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None


class AdminUserResponse(UserResponse):
    """A user as a Facility Admin sees them, with how many active tickets they're assigned."""

    active_ticket_count: int


class RoleChangeRequest(BaseModel):
    """The new role. Only employee and engineer can be given from the app; admins are set up outside it."""

    role: Literal["employee", "engineer"]


class EngineerWorkload(BaseModel):
    """An engineer and their active tickets (open, in progress or blocked), for choosing who to assign."""

    user_id: int
    full_name: str
    email: str
    active_count: int
    open_count: int
    in_progress_count: int
    blocked_count: int
    p1_count: int


class AdminStatusChangeRequest(BaseModel):
    """A Facility Admin finishing with a resolved ticket: close it, or send it back to its engineer.

    Sending back needs a reason (what's still wrong), which the engineer and the employee
    see in the history. A closing note is optional.
    """

    status: Literal["closed", "in_progress"]
    reason: Annotated[TrimmedText, StringConstraints(max_length=500)] | None = None

    @model_validator(mode="after")
    def reason_to_send_back(self) -> Self:
        """The engineer needs to know why the ticket came back."""
        if self.status == "in_progress" and self.reason is None:
            raise ValueError("A reason is required to send a ticket back")
        return self


class AdminMetrics(BaseModel):
    """Headline counts for the admin dashboard. "Active" means not closed, as in the ticket filters."""

    unassigned: int
    open: int
    in_progress: int
    blocked: int
    resolved: int
    active_p1: int
    escalated: int
    closed_last_7_days: int


# --- Facility Admin: facilities ---------------------------------------------------
# Admins see every location, inactive ones too, with how many active (not closed) tickets
# are there. Writes return the one item changed, without its children.

BuildingName = Annotated[TrimmedText, StringConstraints(max_length=100)]
# Basements are negative floors.
FloorNumber = Annotated[int, Field(ge=-10, le=200)]
SeatNumber = Annotated[TrimmedText, StringConstraints(max_length=20)]


class AdminBuilding(BuildingResponse):
    """A building as a Facility Admin sees it."""

    is_active: bool
    active_ticket_count: int


class AdminFloor(FloorResponse):
    """A floor as a Facility Admin sees it."""

    is_active: bool
    active_ticket_count: int


class AdminSeat(SeatResponse):
    """A seat as a Facility Admin sees it."""

    is_active: bool
    active_ticket_count: int


class AdminFloorTree(AdminFloor):
    """A floor with its seats, for the facilities page."""

    seats: list[AdminSeat]


class AdminBuildingTree(AdminBuilding):
    """A building with its floors and their seats, for the facilities page."""

    floors: list[AdminFloorTree]


class BuildingCreate(BaseModel):
    """A new building. Names are unique, ignoring case."""

    model_config = ConfigDict(extra="forbid")

    building_name: BuildingName


class FloorCreate(BaseModel):
    """A new floor. Numbers are unique within a building."""

    model_config = ConfigDict(extra="forbid")

    floor_number: FloorNumber


class SeatCreate(BaseModel):
    """A new seat. Numbers are text (e.g. "12A") and unique on a floor, ignoring case."""

    model_config = ConfigDict(extra="forbid")

    seat_number: SeatNumber


class _LocationUpdate(BaseModel):
    """Shared by the PATCH bodies: send only what changes, but send something."""

    model_config = ConfigDict(extra="forbid")

    is_active: bool | None = None

    @model_validator(mode="after")
    def something_to_change(self) -> Self:
        """An empty body (or only nulls) would be a no-op, which is almost certainly a mistake."""
        if all(value is None for value in self.model_dump().values()):
            raise ValueError("Nothing to change")
        return self


class BuildingUpdate(_LocationUpdate):
    """Rename a building and/or set whether it's active."""

    building_name: BuildingName | None = None


class FloorUpdate(_LocationUpdate):
    """Renumber a floor and/or set whether it's active."""

    floor_number: FloorNumber | None = None


class SeatUpdate(_LocationUpdate):
    """Renumber a seat and/or set whether it's active."""

    seat_number: SeatNumber | None = None


# --- Engineer -------------------------------------------------------------------
# Engineers work their tickets with the same staff views as admins (AdminTicketListItem,
# AdminTicketDetail): priority and the requester's contact details included.


class EngineerTicketFilters(BaseModel):
    """Query parameters for an engineer's own queue. All optional; they combine with AND.

    There's no assignee filter: the queue is always the caller's. Unknown parameters are a 422.
    """

    model_config = ConfigDict(extra="forbid")

    status: TicketStatus | None = None
    priority: Priority | None = None
    building_id: DbId | None = None
    # "active" is everything not closed; leave it out for every ticket they have.
    view: Literal["active", "closed"] | None = None
    q: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None


class StatusChangeRequest(BaseModel):
    """An engineer moving one of their tickets. Closing is for admins; nobody sets a ticket back to open.

    Blocking needs the reason the work is paused, and resolving a summary of what was done:
    both are shown to the employee. Any other move may carry an optional reason.
    """

    status: Literal["in_progress", "blocked", "resolved"]
    reason: Annotated[TrimmedText, StringConstraints(max_length=500)] | None = None

    @model_validator(mode="after")
    def reason_when_required(self) -> Self:
        """Blocked and resolved tickets need a reason the employee can read."""
        if self.status in ("blocked", "resolved") and self.reason is None:
            raise ValueError(f"A reason is required to mark a ticket {self.status}")
        return self
