"""Request and response models for users, plus the shared email, name and password types."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, StringConstraints, field_validator, model_validator
from pydantic_core import PydanticCustomError

from app.db.models import User
from app.schemas.common import RequestModel, ResponseModel
from app.schemas.departments import RecordId, reject_control_characters

Role = Literal["ADMIN", "PM", "LEAD", "VIEWER"]

# bcrypt 5 raises on input longer than 72 bytes, so the limit is in bytes, not characters.
PASSWORD_MIN_BYTES = 8
PASSWORD_MAX_BYTES = 72
EMAIL_MAX_LENGTH = 255

# Deliberately simple (no email-validator package): local@domain.tld, with no
# spaces or control characters anywhere.
_EMAIL_PATTERN = re.compile(
    r"[^@\s\x00-\x1f\x7f]+"  # local part
    r"@[^@\s\x00-\x1f\x7f.]+"  # first domain label
    r"(?:\.[^@\s\x00-\x1f\x7f.]+)+"  # one or more further labels
)


def normalize_email(value: str) -> str:
    """Check that the address looks like ``name@example.com`` and return it lowercased."""
    if not _EMAIL_PATTERN.fullmatch(value):
        raise PydanticCustomError(
            "email_format", "Enter a valid email address, such as name@example.com."
        )
    lowered = value.lower()
    if len(lowered) > EMAIL_MAX_LENGTH:
        raise PydanticCustomError(
            "email_length", "The email address must be at most 255 characters."
        )
    return lowered


def check_password_bytes(value: str) -> str:
    """Accept passwords of 8 to 72 bytes once encoded as UTF-8."""
    try:
        size = len(value.encode("utf-8"))
    except UnicodeEncodeError:
        raise PydanticCustomError(
            "password_encoding",
            "The password contains characters that cannot be encoded as UTF-8.",
        ) from None
    if not PASSWORD_MIN_BYTES <= size <= PASSWORD_MAX_BYTES:
        raise PydanticCustomError(
            "password_length",
            "The password must be 8 to 72 bytes long in UTF-8; this one is {size} bytes.",
            {"size": size},
        )
    return value


# Email addresses are trimmed, checked and stored lowercased.
Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=EMAIL_MAX_LENGTH),
    AfterValidator(normalize_email),
]

# Display names: trimmed, 1-150 characters (VARCHAR(150)).
PersonName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=150),
    AfterValidator(reject_control_characters),
]

# Passwords are never trimmed: every character the user typed counts.
Password = Annotated[
    str,
    StringConstraints(strip_whitespace=False),
    AfterValidator(check_password_bytes),
]


class UserCreate(RequestModel):
    """Body of ``POST /users`` (ADMIN only)."""

    name: PersonName
    email: Email
    password: Password
    role: Role
    department_id: RecordId | None = None


class UserUpdate(RequestModel):
    """Body of ``PUT /users/{id}`` (ADMIN only): any subset of the fields.

    Omitted fields keep their value. ``department_id: null`` removes the user from
    their department; ``name``, ``email``, ``role`` and ``password`` cannot be null.
    """

    name: PersonName | None = None
    email: Email | None = None
    role: Role | None = None
    department_id: RecordId | None = None
    password: Password | None = None

    @field_validator("name", "email", "role", "password", mode="before")
    @classmethod
    def _reject_null(cls, value: Any) -> Any:
        """Refuse an explicit null for fields that cannot be empty."""
        if value is None:
            raise PydanticCustomError(
                "null_not_allowed",
                "This field cannot be null; leave it out to keep the current value.",
            )
        return value

    @model_validator(mode="after")
    def _require_a_field(self) -> UserUpdate:
        """Refuse an empty body: an update must change something."""
        if not self.model_fields_set:
            raise PydanticCustomError("empty_update", "Send at least one field to change.")
        return self


class UserOut(ResponseModel):
    """A user as returned by the API. The password hash is never included."""

    id: int
    name: str
    email: str
    role: Role
    department_id: int | None
    department_name: str | None
    created_at: datetime

    @classmethod
    def from_user(cls, user: User) -> UserOut:
        """Build the response from an ORM user, including the department's name."""
        return cls(
            id=user.id,
            name=user.name,
            email=user.email,
            role=user.role,
            department_id=user.department_id,
            department_name=user.department.name if user.department is not None else None,
            created_at=user.created_at,
        )
