"""Request body for the projects endpoints (POST and PUT share it: PUT is a full update)."""

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal, get_args

from pydantic import Field, ValidationInfo, field_validator

from app.core.validation import MAX_MONEY, ApiModel, Description, IsoDate, Name150, Text100

ProjectStatus = Literal["planned", "active", "on_hold", "completed", "cancelled"]
PROJECT_STATUSES = get_args(ProjectStatus)

Budget = Annotated[Decimal, Field(ge=0, le=MAX_MONEY, decimal_places=2)]


class ProjectRequest(ApiModel):
    """Body of POST /projects and PUT /projects/{id}."""

    name: Name150
    description: Description = ""
    department: Text100
    status: ProjectStatus = "planned"
    start_date: IsoDate
    end_date: IsoDate
    budget: Budget = Decimal("0")

    @field_validator("end_date")
    @classmethod
    def _not_before_start(cls, end_date: date, info: ValidationInfo) -> date:
        """Reported on end_date; skipped when start_date is itself invalid."""
        start_date = info.data.get("start_date")
        if start_date is not None and end_date < start_date:
            raise ValueError("Must be on or after start_date")
        return end_date
