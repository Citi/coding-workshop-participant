"""Request and response models for projects, plus helpers shared by the allocation and budget-entry schemas.

Money is ``Decimal`` end to end: request amounts are checked against
``NUMERIC(14, 2)`` (at most 12 digits before the point and 2 after it) and
normalised to cents, and responses serialise money as strings such as
``"400000.00"``. Computed percentages are JSON numbers with one decimal, or null.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)
from pydantic_core import PydanticCustomError

from app.db.models import Project
from app.engines.types import ProjectBudget, RiskAssessment
from app.schemas.common import RequestModel, ResponseModel
from app.schemas.departments import MAX_ID, reject_control_characters

ProjectStatus = Literal["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]

PROJECT_NAME_MAX_LENGTH = 200
# projects.description is TEXT; the cap only keeps request bodies to a sensible size.
DESCRIPTION_MAX_LENGTH = 10_000
# NUMERIC(14, 2): 14 digits in total, 2 of them after the decimal point.
MONEY_MAX_DIGITS = 14
MONEY_DECIMAL_PLACES = 2

_CENTS = Decimal("0.01")
# Line breaks and tabs are fine in multi-line text; every other control character is refused.
_TEXT_WHITESPACE = frozenset("\n\r\t")


# --- Shared validators -----------------------------------------------------------------------------


def reject_bool(value: Any) -> Any:
    """Refuse ``true``/``false`` where a number is expected (Pydantic would read ``true`` as 1)."""
    if isinstance(value, bool):
        raise PydanticCustomError("bool_not_allowed", "Expected a number, not true or false.")
    return value


def to_cents(value: Decimal) -> Decimal:
    """Return an amount with exactly two decimal places: 400000 -> 400000.00, -0 -> 0.00."""
    cents = value.quantize(_CENTS)
    return cents.copy_abs() if cents.is_zero() else cents


def reject_text_controls(value: str) -> str:
    """Refuse control characters other than line breaks and tabs (PostgreSQL cannot store NUL)."""
    if any((ord(char) < 32 or ord(char) == 127) and char not in _TEXT_WHITESPACE for char in value):
        raise PydanticCustomError(
            "control_characters", "Must not contain control characters other than line breaks and tabs."
        )
    return value


def blank_to_none(value: str) -> str | None:
    """Store an empty (or all-whitespace, once trimmed) optional text as null."""
    return value or None


def refuse_null(value: Any) -> Any:
    """Refuse an explicit null in an update for a field that cannot be empty."""
    if value is None:
        raise PydanticCustomError(
            "null_not_allowed", "This field cannot be null; leave it out to keep the current value."
        )
    return value


def require_some_field(model: BaseModel) -> None:
    """Refuse an empty update body: an update must change something."""
    if not model.model_fields_set:
        raise PydanticCustomError("empty_update", "Send at least one field to change.")


# --- Shared field types ----------------------------------------------------------------------------

# A reference to a row by id: 1..MAX_ID, checked before any query runs; booleans are refused.
RefId = Annotated[int, BeforeValidator(reject_bool), Field(ge=1, le=MAX_ID)]

# Money that may be zero (planned budgets): at most 12 integer digits and 2 decimals.
Money = Annotated[
    Decimal,
    Field(ge=0, max_digits=MONEY_MAX_DIGITS, decimal_places=MONEY_DECIMAL_PLACES),
    AfterValidator(to_cents),
]

# Money that must be positive (budget entries): at most 12 integer digits and 2 decimals.
PositiveMoney = Annotated[
    Decimal,
    Field(gt=0, max_digits=MONEY_MAX_DIGITS, decimal_places=MONEY_DECIMAL_PLACES),
    AfterValidator(to_cents),
]

# Project names: trimmed, 1-200 characters (VARCHAR(200)), no control characters.
ProjectName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=PROJECT_NAME_MAX_LENGTH),
    AfterValidator(reject_control_characters),
]

# Free, multi-line text; blank becomes null.
Description = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=DESCRIPTION_MAX_LENGTH),
    AfterValidator(reject_text_controls),
    AfterValidator(blank_to_none),
]


# --- Requests --------------------------------------------------------------------------------------


class ProjectCreate(RequestModel):
    """Body of ``POST /projects`` (ADMIN, PM).

    ``department_id`` and ``project_manager_id`` must exist (400
    ``INVALID_REFERENCE``); ``end_date`` must not be before ``start_date``
    (400 ``VALIDATION_ERROR`` on ``end_date``, checked by the service).
    """

    project_name: ProjectName
    description: Description | None = None
    department_id: RefId
    project_manager_id: RefId | None = None
    start_date: date
    end_date: date
    planned_budget: Money = Decimal("0.00")
    status: ProjectStatus = "PLANNED"


class ProjectUpdate(RequestModel):
    """Body of ``PUT /projects/{id}`` (ADMIN, PM): any subset of the create fields.

    Omitted fields keep their value. ``description: null`` clears the
    description and ``project_manager_id: null`` removes the manager; the other
    fields cannot be null. The dates are re-checked against the merged values.
    """

    project_name: ProjectName | None = None
    description: Description | None = None
    department_id: RefId | None = None
    project_manager_id: RefId | None = None
    start_date: date | None = None
    end_date: date | None = None
    planned_budget: Money | None = None
    status: ProjectStatus | None = None

    @field_validator(
        "project_name", "department_id", "start_date", "end_date", "planned_budget", "status", mode="before"
    )
    @classmethod
    def _reject_null(cls, value: Any) -> Any:
        """Refuse an explicit null for fields that cannot be empty."""
        return refuse_null(value)

    @model_validator(mode="after")
    def _require_a_field(self) -> ProjectUpdate:
        """Refuse an empty body."""
        require_some_field(self)
        return self


# --- Responses -------------------------------------------------------------------------------------


def _pct(value: Decimal | None) -> float | None:
    """Turn an engine percentage (one decimal) into a JSON number, keeping null."""
    return None if value is None else float(value)


class ProjectOut(ResponseModel):
    """A project with the metrics computed on read for one ``as_of`` date.

    ``actual_spend`` is the sum of its budget entries and ``remaining_budget`` is
    planned minus actual. ``completion_pct`` is the mean deliverable completion
    and ``utilization_pct`` is spend as a percentage of plan (null when the plan
    is 0). ``risk_score``/``risk_level`` come from the risk engine (spec 9.4).
    """

    id: int
    project_name: str
    description: str | None
    department_id: int
    department_name: str
    project_manager_id: int | None
    project_manager_name: str | None
    start_date: date
    end_date: date
    planned_budget: Decimal
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime
    completion_pct: float
    actual_spend: Decimal
    remaining_budget: Decimal
    utilization_pct: float | None
    risk_score: int
    risk_level: RiskLevel

    @classmethod
    def build(cls, project: Project, budget: ProjectBudget, risk: RiskAssessment) -> ProjectOut:
        """Combine the stored project with its budget and risk results from one portfolio analysis."""
        manager = project.project_manager
        return cls(
            id=project.id,
            project_name=project.project_name,
            description=project.description,
            department_id=project.department_id,
            department_name=project.department.name,
            project_manager_id=project.project_manager_id,
            project_manager_name=manager.name if manager is not None else None,
            start_date=project.start_date,
            end_date=project.end_date,
            planned_budget=to_cents(Decimal(project.planned_budget)),
            status=project.status,
            created_at=project.created_at,
            updated_at=project.updated_at,
            completion_pct=float(budget.completion_pct),
            actual_spend=budget.actual_spend,
            remaining_budget=budget.remaining,
            utilization_pct=_pct(budget.utilization_pct),
            risk_score=risk.risk_score,
            risk_level=risk.risk_level,
        )
