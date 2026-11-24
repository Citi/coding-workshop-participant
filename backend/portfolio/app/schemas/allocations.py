"""Request and response models for resource allocations and the over-allocation warning."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any

from pydantic import BeforeValidator, Field, field_validator, model_validator

from app.db.models import ResourceAllocation
from app.schemas.common import RequestModel, ResponseModel
from app.schemas.projects import RefId, refuse_null, reject_bool, require_some_field

# A share of one person's time, in whole percentage points (SMALLINT 1-100).
Percentage = Annotated[int, BeforeValidator(reject_bool), Field(ge=1, le=100)]


class AllocationCreate(RequestModel):
    """Body of ``POST /allocations`` (ADMIN, PM).

    ``user_id`` and ``project_id`` must exist; ``deliverable_id``, when given,
    must exist and belong to ``project_id``. Both dates are inclusive and
    ``end_date`` must not be before ``start_date``. Over-allocation never blocks
    the save: the response carries a ``capacity_warning`` instead.
    """

    user_id: RefId
    project_id: RefId
    deliverable_id: RefId | None = None
    allocation_percentage: Percentage
    start_date: date
    end_date: date


class AllocationUpdate(RequestModel):
    """Body of ``PUT /allocations/{id}`` (ADMIN, PM): any subset of the create fields.

    Omitted fields keep their value; ``deliverable_id: null`` makes it a
    project-level allocation. References and dates are re-checked against the
    merged values, so a new ``project_id`` needs a matching ``deliverable_id``.
    """

    user_id: RefId | None = None
    project_id: RefId | None = None
    deliverable_id: RefId | None = None
    allocation_percentage: Percentage | None = None
    start_date: date | None = None
    end_date: date | None = None

    @field_validator("user_id", "project_id", "allocation_percentage", "start_date", "end_date", mode="before")
    @classmethod
    def _reject_null(cls, value: Any) -> Any:
        """Refuse an explicit null for fields that cannot be empty."""
        return refuse_null(value)

    @model_validator(mode="after")
    def _require_a_field(self) -> AllocationUpdate:
        """Refuse an empty body."""
        require_some_field(self)
        return self


class AllocationOut(ResponseModel):
    """An allocation with the names of the person, project and deliverable it links."""

    id: int
    user_id: int
    user_name: str
    project_id: int
    project_name: str
    deliverable_id: int | None
    deliverable_title: str | None
    allocation_percentage: int
    start_date: date
    end_date: date
    created_at: datetime

    @classmethod
    def from_allocation(cls, allocation: ResourceAllocation) -> AllocationOut:
        """Build the response from an ORM allocation and its eager-loaded relationships."""
        return cls(**_allocation_fields(allocation))


class CapacityWindow(ResponseModel):
    """A date range (both ends inclusive) in which the person's total load is above 100%."""

    start_date: date
    end_date: date
    load: int


class CapacityWarning(ResponseModel):
    """Why a saved allocation leaves its person above 100%.

    ``windows`` are the conflict segments that include this allocation, in date
    order; ``peak_load`` is the highest load among them.
    """

    user_id: int
    user_name: str
    peak_load: int
    windows: list[CapacityWindow]
    message: str


class AllocationWriteOut(AllocationOut):
    """Response of ``POST`` and ``PUT /allocations``: the allocation plus ``capacity_warning`` (or null)."""

    capacity_warning: CapacityWarning | None

    @classmethod
    def from_write(cls, allocation: ResourceAllocation, warning: CapacityWarning | None) -> AllocationWriteOut:
        """Build the response from the saved allocation and its capacity warning."""
        return cls(**_allocation_fields(allocation), capacity_warning=warning)


def _allocation_fields(allocation: ResourceAllocation) -> dict[str, Any]:
    """Return the ``AllocationOut`` fields of an ORM allocation."""
    deliverable = allocation.deliverable
    return {
        "id": allocation.id,
        "user_id": allocation.user_id,
        "user_name": allocation.user.name,
        "project_id": allocation.project_id,
        "project_name": allocation.project.project_name,
        "deliverable_id": allocation.deliverable_id,
        "deliverable_title": deliverable.title if deliverable is not None else None,
        "allocation_percentage": allocation.allocation_percentage,
        "start_date": allocation.start_date,
        "end_date": allocation.end_date,
        "created_at": allocation.created_at,
    }
