"""Request body for the deliverables endpoints (POST and PUT share it: PUT is a full update)."""

from typing import Literal, get_args

from pydantic import Field, ValidatorFunctionWrapHandler, field_validator
from pydantic import ValidationError as PydanticValidationError

from app.core.validation import ApiModel, Description, IsoDate, Name150, StrictId

DeliverableStatus = Literal["not_started", "in_progress", "blocked", "completed"]
DELIVERABLE_STATUSES = get_args(DeliverableStatus)


class DeliverableRequest(ApiModel):
    """Body of POST /deliverables and PUT /deliverables/{id}."""

    project_id: StrictId
    name: Name150
    description: Description = ""
    status: DeliverableStatus = "not_started"
    due_date: IsoDate
    is_key: bool = False
    owner_id: StrictId | None = None
    depends_on_ids: list[StrictId] = Field(default_factory=list)

    @field_validator("depends_on_ids", mode="wrap")
    @classmethod
    def _id_list(cls, value, handler: ValidatorFunctionWrapHandler) -> list[int]:
        """Report problems on the field itself (not per list item) so the form can show them."""
        try:
            ids = handler(value)
        except PydanticValidationError:
            raise ValueError("Must be a list of deliverable ids") from None
        if len(set(ids)) != len(ids):
            raise ValueError("Must not contain duplicate ids")
        return ids
