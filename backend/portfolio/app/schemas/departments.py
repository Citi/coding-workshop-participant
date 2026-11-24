"""Request and response models for departments, plus validators shared by other modules."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, Field, StringConstraints
from pydantic_core import PydanticCustomError

from app.schemas.common import RequestModel, ResponseModel

# Largest value a BIGINT identity column can hold; a larger id can never exist.
MAX_ID = 9_223_372_036_854_775_807

# A reference to an existing row by id (validated as 1..MAX_ID before any query runs).
RecordId = Annotated[int, Field(ge=1, le=MAX_ID)]


def reject_control_characters(value: str) -> str:
    """Refuse text containing control characters such as NUL, tabs or line breaks.

    PostgreSQL cannot store or compare NUL (psycopg raises ``DataError``, which
    would surface as a 500), and none of them belong in a name, an address or a
    search term.
    """
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise PydanticCustomError(
            "control_characters",
            "Must not contain control characters such as tabs or line breaks.",
        )
    return value


# Free-text search terms (the ``q`` query parameter of list endpoints). Every
# name, email and department name is stored without control characters, so a
# term containing one could never match; refusing it keeps NUL away from SQL.
SearchText = Annotated[str, AfterValidator(reject_control_characters)]

# Department names: trimmed, 1-100 characters (VARCHAR(100)), unique ignoring case.
DepartmentName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    AfterValidator(reject_control_characters),
]


class DepartmentCreate(RequestModel):
    """Body of ``POST /departments`` (ADMIN only)."""

    name: DepartmentName


class DepartmentUpdate(RequestModel):
    """Body of ``PUT /departments/{id}`` (ADMIN only): the new name."""

    name: DepartmentName


class DepartmentOut(ResponseModel):
    """A department as returned by the API."""

    id: int
    name: str
    created_at: datetime
