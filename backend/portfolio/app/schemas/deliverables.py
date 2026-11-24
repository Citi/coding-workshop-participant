"""Request and response models for deliverables and their downstream impact."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, field_validator, model_validator
from pydantic_core import PydanticCustomError

from app.db.models import Deliverable
from app.schemas.common import RequestModel, ResponseModel
from app.schemas.departments import RecordId, reject_control_characters

DeliverableStatus = Literal["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"]

# Column limits (schema.sql: title is VARCHAR(200); description and blocked_reason are TEXT,
# capped here so one request cannot store an unbounded amount of text).
TITLE_MAX_LENGTH = 200
DESCRIPTION_MAX_LENGTH = 10_000
BLOCKED_REASON_MAX_LENGTH = 2_000

# Control characters allowed in multi-line text: tab, line feed and carriage return.
_TEXT_WHITESPACE = frozenset("\t\n\r")


def reject_binary_characters(value: str) -> str:
    """Refuse free text containing control characters other than tabs and line breaks.

    PostgreSQL cannot store NUL in a TEXT column, and the other control
    characters never belong in a description or a reason.
    """
    if any((ord(char) < 32 and char not in _TEXT_WHITESPACE) or ord(char) == 127 for char in value):
        raise PydanticCustomError(
            "control_characters", "Must not contain control characters other than tabs and line breaks."
        )
    return value


def blank_to_none(value: str) -> str | None:
    """Store an empty (or whitespace-only, once trimmed) text as null."""
    return value or None


# Titles: trimmed, 1-200 characters, single line.
Title = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=TITLE_MAX_LENGTH),
    AfterValidator(reject_control_characters),
]

# Optional free text: trimmed, may span lines; blank becomes null.
Description = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=DESCRIPTION_MAX_LENGTH),
    AfterValidator(reject_binary_characters),
    AfterValidator(blank_to_none),
]
BlockedReason = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=BLOCKED_REASON_MAX_LENGTH),
    AfterValidator(reject_binary_characters),
    AfterValidator(blank_to_none),
]

# Progress in whole percent.
Completion = Annotated[int, Field(ge=0, le=100)]


def is_overdue(status: str, due_date: date, today: date) -> bool:
    """Return True when the deliverable is not DONE and its due date is before ``today``."""
    return status != "DONE" and due_date < today


class DeliverableCreate(RequestModel):
    """Body of ``POST /deliverables`` (ADMIN, PM, LEAD).

    Status ``DONE`` forces completion to 100, and ``blocked_reason`` is kept only
    when the status is ``BLOCKED``. The due date must not be before the start date.
    """

    project_id: RecordId
    title: Title
    description: Description | None = None
    assigned_user_id: RecordId | None = None
    start_date: date | None = None
    due_date: date
    completion_percentage: Completion = 0
    status: DeliverableStatus = "NOT_STARTED"
    blocked_reason: BlockedReason | None = None


class DeliverableUpdate(RequestModel):
    """Body of ``PUT /deliverables/{id}`` (ADMIN, PM, LEAD): any subset of the fields.

    Omitted fields keep their value. ``project_id`` is immutable: it may be sent
    only with the deliverable's current project. ``description``,
    ``assigned_user_id``, ``start_date`` and ``blocked_reason`` accept null to
    clear them; the other fields cannot be null.
    """

    project_id: RecordId | None = None
    title: Title | None = None
    description: Description | None = None
    assigned_user_id: RecordId | None = None
    start_date: date | None = None
    due_date: date | None = None
    completion_percentage: Completion | None = None
    status: DeliverableStatus | None = None
    blocked_reason: BlockedReason | None = None

    @field_validator("project_id", "title", "due_date", "completion_percentage", "status", mode="before")
    @classmethod
    def _reject_null(cls, value: Any) -> Any:
        """Refuse an explicit null for fields that cannot be empty."""
        if value is None:
            raise PydanticCustomError(
                "null_not_allowed", "This field cannot be null; leave it out to keep the current value."
            )
        return value

    @model_validator(mode="after")
    def _require_a_field(self) -> DeliverableUpdate:
        """Refuse an empty body: an update must change something."""
        if not self.model_fields_set:
            raise PydanticCustomError("empty_update", "Send at least one field to change.")
        return self


class DeliverableOut(ResponseModel):
    """A deliverable as returned by the API, with its project and assignee names.

    ``is_overdue`` is true when the status is not DONE and the due date is before
    today (UTC).
    """

    id: int
    project_id: int
    project_name: str
    title: str
    description: str | None
    assigned_user_id: int | None
    assigned_user_name: str | None
    start_date: date | None
    due_date: date
    completion_percentage: int
    status: DeliverableStatus
    blocked_reason: str | None
    is_overdue: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_deliverable(cls, deliverable: Deliverable, today: date) -> DeliverableOut:
        """Build the response from an ORM deliverable whose project and assignee are loaded."""
        assignee = deliverable.assigned_user
        return cls(
            id=deliverable.id,
            project_id=deliverable.project_id,
            project_name=deliverable.project.project_name,
            title=deliverable.title,
            description=deliverable.description,
            assigned_user_id=deliverable.assigned_user_id,
            assigned_user_name=assignee.name if assignee is not None else None,
            start_date=deliverable.start_date,
            due_date=deliverable.due_date,
            completion_percentage=deliverable.completion_percentage,
            status=deliverable.status,
            blocked_reason=deliverable.blocked_reason,
            is_overdue=is_overdue(deliverable.status, deliverable.due_date, today),
            created_at=deliverable.created_at,
            updated_at=deliverable.updated_at,
        )

    @classmethod
    def from_row(cls, row: Any, today: date) -> DeliverableOut:
        """Build the response from a list-query row whose labels match the field names."""
        values = dict(row._mapping)
        return cls(**values, is_overdue=is_overdue(values["status"], values["due_date"], today))


class ImpactItemOut(BaseModel):
    """One deliverable downstream of another, ``depth`` edges away (1 = direct successor)."""

    id: int
    title: str
    project_id: int
    status: DeliverableStatus
    depth: int


class DeliverableImpactOut(BaseModel):
    """Response of ``GET /deliverables/{id}/impact``: everything downstream, nearest first."""

    deliverable_id: int
    title: str
    items: list[ImpactItemOut]
    total: int
