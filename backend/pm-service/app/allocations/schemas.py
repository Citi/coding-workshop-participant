"""Request bodies for the allocations endpoints."""

from typing import Annotated

from pydantic import Field, Strict

from app.core.validation import ApiModel, StrictId

# Strict: JSON integers only. pydantic's lax mode would read true as 1 and "50" or 50.0 as 50.
AllocationPercent = Annotated[int, Strict(), Field(ge=1, le=100)]


class AllocationRequest(ApiModel):
    """Body of POST /allocations and PUT /allocations/{id} (PUT is a full update)."""

    resource_id: StrictId
    project_id: StrictId
    allocation_percent: AllocationPercent
