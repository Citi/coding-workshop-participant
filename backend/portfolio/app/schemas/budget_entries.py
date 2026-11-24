"""Request and response models for budget entries (actual spend against a project)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, StringConstraints, field_validator, model_validator

from app.db.models import BudgetEntry
from app.schemas.common import RequestModel, ResponseModel
from app.schemas.departments import reject_control_characters
from app.schemas.projects import PositiveMoney, RefId, blank_to_none, refuse_null, require_some_field

BudgetCategory = Literal["LABOR", "SOFTWARE", "HARDWARE", "VENDOR", "TRAVEL", "OTHER"]

ENTRY_DESCRIPTION_MAX_LENGTH = 300

# One-line description (VARCHAR(300)): trimmed, no control characters; blank becomes null.
EntryDescription = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=ENTRY_DESCRIPTION_MAX_LENGTH),
    AfterValidator(reject_control_characters),
    AfterValidator(blank_to_none),
]


class BudgetEntryCreate(RequestModel):
    """Body of ``POST /budget-entries`` (ADMIN, PM).

    ``amount`` must be above 0 with at most 2 decimals and 12 integer digits;
    send it as a decimal string such as ``"1500.00"`` (numbers are accepted too).
    ``project_id`` must exist (400 ``INVALID_REFERENCE``).
    """

    project_id: RefId
    category: BudgetCategory
    description: EntryDescription | None = None
    amount: PositiveMoney
    entry_date: date


class BudgetEntryUpdate(RequestModel):
    """Body of ``PUT /budget-entries/{id}`` (ADMIN, PM): any subset of the create fields.

    Omitted fields keep their value; ``description: null`` clears it. The other
    fields cannot be null.
    """

    project_id: RefId | None = None
    category: BudgetCategory | None = None
    description: EntryDescription | None = None
    amount: PositiveMoney | None = None
    entry_date: date | None = None

    @field_validator("project_id", "category", "amount", "entry_date", mode="before")
    @classmethod
    def _reject_null(cls, value: Any) -> Any:
        """Refuse an explicit null for fields that cannot be empty."""
        return refuse_null(value)

    @model_validator(mode="after")
    def _require_a_field(self) -> BudgetEntryUpdate:
        """Refuse an empty body."""
        require_some_field(self)
        return self


class BudgetEntryOut(ResponseModel):
    """A budget entry with its project's name; ``amount`` serialises as a string such as ``"1500.00"``."""

    id: int
    project_id: int
    project_name: str
    category: BudgetCategory
    description: str | None
    amount: Decimal
    entry_date: date
    created_at: datetime

    @classmethod
    def from_entry(cls, entry: BudgetEntry) -> BudgetEntryOut:
        """Build the response from an ORM budget entry and its eager-loaded project."""
        return cls(
            id=entry.id,
            project_id=entry.project_id,
            project_name=entry.project.project_name,
            category=entry.category,
            description=entry.description,
            amount=entry.amount,
            entry_date=entry.entry_date,
            created_at=entry.created_at,
        )
