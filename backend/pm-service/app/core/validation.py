"""Validation shared by every domain: JSON body -> pydantic model, query parameters,
and common field types. All failures become 400 VALIDATION_ERROR with per-field details.
"""

import re
from collections.abc import Iterable
from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, Strict, StringConstraints
from pydantic import ValidationError as PydanticValidationError

from app.core.errors import ValidationError

MAX_DB_INT = 2_147_483_647
MAX_MONEY = Decimal("999999999999.99")  # the largest value a NUMERIC(14,2) column holds
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_TRUE_VALUES = {"true", "1", "yes"}
_FALSE_VALUES = {"false", "0", "no"}
_NUL_MESSAGE = "Must not contain NUL characters"


def _check_email(value: str) -> str:
    if not _EMAIL_PATTERN.match(value):
        raise ValueError("Must be a valid email address")
    return value


def _no_nul(value: str) -> str:
    """PostgreSQL text cannot store NUL (\\x00); report it on the field instead of failing in the database."""
    if "\x00" in value:
        raise ValueError(_NUL_MESSAGE)
    return value


def _iso_date_text(value):
    """Only "YYYY-MM-DD" text: lax pydantic would also read 0 or "0" as a Unix timestamp (1970-01-01)."""
    if isinstance(value, str) and _ISO_DATE.fullmatch(value):
        return value
    raise ValueError("Must be a date in YYYY-MM-DD format")


def _text(min_length: int, max_length: int):
    return Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length),
        AfterValidator(_no_nul),
    ]


# Reusable field types (use them in each domain's schemas.py).
Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=255),
    AfterValidator(_no_nul),
    AfterValidator(_check_email),
]
Name150 = _text(1, 150)
Name120 = _text(1, 120)
Text100 = _text(1, 100)
Text255 = _text(1, 255)
Description = _text(0, 5000)
EntityId = Annotated[int, Field(gt=0, le=MAX_DB_INT)]
# Ids in request bodies: JSON integers only (lax mode would read true, "1" or 1.0 as id 1).
StrictId = Annotated[EntityId, Strict()]
# Calendar dates in request bodies: "YYYY-MM-DD" text only.
IsoDate = Annotated[date, BeforeValidator(_iso_date_text)]


class ApiModel(BaseModel):
    """Base class for request bodies. Unknown fields are ignored, so clients may send back
    a full object they previously received (including computed, read-only fields)."""

    model_config = ConfigDict(extra="ignore")


_FRIENDLY_MESSAGES = {
    "missing": "This field is required",
    "int_parsing": "Must be a whole number",
    "int_type": "Must be a whole number",
    "int_from_float": "Must be a whole number",
    "decimal_parsing": "Must be a number",
    "decimal_type": "Must be a number",
    "float_parsing": "Must be a number",
    "date_parsing": "Must be a date in YYYY-MM-DD format",
    "date_from_datetime_parsing": "Must be a date in YYYY-MM-DD format",
    "date_type": "Must be a date in YYYY-MM-DD format",
    "bool_parsing": "Must be true or false",
    "bool_type": "Must be true or false",
    "string_type": "Must be text",
    "list_type": "Must be a list",
}


# Messages that depend on the rule's limit (pydantic puts it in the error's ``ctx``).
_LIMIT_MESSAGES = {
    "string_too_long": ("max_length", "Must be at most {} characters"),
    "greater_than": ("gt", "Must be greater than {}"),
    "greater_than_equal": ("ge", "Must be at least {}"),
    "less_than": ("lt", "Must be less than {}"),
    "less_than_equal": ("le", "Must be at most {}"),
    "decimal_max_places": ("decimal_places", "Use at most {} decimal places"),
    "literal_error": ("expected", "Must be {}"),
}


def _friendly_message(error: dict) -> str:
    error_type = error.get("type", "")
    ctx = error.get("ctx") or {}
    if error_type == "string_too_short" and ctx.get("min_length") == 1:
        return "This field is required"
    if error_type in _FRIENDLY_MESSAGES:
        return _FRIENDLY_MESSAGES[error_type]
    if error_type in _LIMIT_MESSAGES:
        key, template = _LIMIT_MESSAGES[error_type]
        if key in ctx:
            return template.format(ctx[key])
    message = str(error.get("msg", "Invalid value"))
    return message.removeprefix("Value error, ")


def format_validation_errors(exc: PydanticValidationError) -> dict:
    """Turn pydantic errors into ``{"field": "message"}`` (first message per field)."""
    details: dict = {}
    for error in exc.errors():
        field = ".".join(str(part) for part in error.get("loc", ())) or "body"
        details.setdefault(field, _friendly_message(error))
    return details


def parse_body[ModelT: BaseModel](model: type[ModelT], req) -> ModelT:
    """Validate the request's JSON body against ``model`` (400 on any problem)."""
    data = req.json()
    if data is None:
        raise ValidationError("Request body is required", details={"body": "Request body is required"})
    if not isinstance(data, dict):
        raise ValidationError("Request body must be a JSON object", details={"body": "Must be a JSON object"})
    try:
        return model.model_validate(data)
    except PydanticValidationError as exc:
        raise ValidationError("Validation failed", details=format_validation_errors(exc)) from exc


def _invalid_query(name: str, message: str) -> ValidationError:
    return ValidationError(f"Invalid query parameter '{name}'", details={name: message})


def query_str(req, name: str, *, max_length: int = 200) -> str | None:
    """Trimmed string parameter; ``None`` when absent or blank."""
    value = req.query.get(name)
    if value is None or not str(value).strip():
        return None
    value = str(value).strip()
    if len(value) > max_length:
        raise _invalid_query(name, f"Must be at most {max_length} characters")
    if "\x00" in value:
        raise _invalid_query(name, _NUL_MESSAGE)
    return value


def query_int(req, name: str) -> int | None:
    """Positive integer parameter (e.g. ``project_id``)."""
    value = query_str(req, name)
    if value is None:
        return None
    if not value.isascii() or not value.isdigit() or not 0 < int(value) <= MAX_DB_INT:
        raise _invalid_query(name, "Must be a positive integer")
    return int(value)


def query_bool(req, name: str) -> bool | None:
    """Boolean parameter: true/false, 1/0, yes/no (case-insensitive)."""
    value = query_str(req, name)
    if value is None:
        return None
    lowered = value.lower()
    if lowered in _TRUE_VALUES:
        return True
    if lowered in _FALSE_VALUES:
        return False
    raise _invalid_query(name, "Must be true or false")


def _one_of(allowed: tuple[str, ...]) -> str:
    return f"Must be one of: {', '.join(allowed)}"


def query_enum(req, name: str, allowed: Iterable[str]) -> str | None:
    """Parameter restricted to a fixed set of values."""
    value = query_str(req, name)
    if value is None:
        return None
    allowed = tuple(allowed)
    if value not in allowed:
        raise _invalid_query(name, _one_of(allowed))
    return value


def query_enum_list(req, name: str, allowed: Iterable[str]) -> tuple[str, ...] | None:
    """Comma-separated list of values from a fixed set (``?health=at_risk,overdue``).

    Items are trimmed, empty items are ignored and duplicates dropped (first occurrence wins).
    ``None`` when absent or blank; any unknown item is a 400 naming the parameter, like ``query_enum``.
    """
    value = query_str(req, name)
    if value is None:
        return None
    allowed = tuple(allowed)
    values = tuple(dict.fromkeys(item.strip() for item in value.split(",") if item.strip()))
    if any(item not in allowed for item in values):
        raise _invalid_query(name, _one_of(allowed))
    return values or None


def query_date(req, name: str) -> date | None:
    """ISO date parameter (exactly YYYY-MM-DD; Python alone would also accept 20260215 or 2026-W07-7)."""
    value = query_str(req, name)
    if value is None:
        return None
    try:
        if not _ISO_DATE.fullmatch(value):
            raise ValueError(value)
        return date.fromisoformat(value)
    except ValueError as exc:
        raise _invalid_query(name, "Must be a date in YYYY-MM-DD format") from exc
