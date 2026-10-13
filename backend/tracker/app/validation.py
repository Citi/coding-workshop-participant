"""
Declarative-ish field validation that collects every error before failing.

Usage::

    v = Validator(body)
    name = v.string("name", required=True, max_len=150)
    v.raise_if_errors()
"""

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable, Optional

from .errors import ValidationError

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,30}$")

_MISSING = object()


class Validator:
    """Accumulates field errors for a request payload."""

    def __init__(self, data: dict[str, Any], partial: bool = False) -> None:
        """Wrap a payload. ``partial`` skips required checks for absent fields (PUT/PATCH)."""
        self.data = data
        self.partial = partial
        self.errors: dict[str, str] = {}

    def has(self, key: str) -> bool:
        """Return True when the key is present in the payload."""
        return key in self.data

    def _get(self, key: str, required: bool) -> Any:
        value = self.data.get(key, _MISSING)
        if value is _MISSING or value is None or (isinstance(value, str) and not value.strip()):
            if required and not (self.partial and key not in self.data):
                self.errors[key] = "This field is required."
            return _MISSING
        return value

    def string(self, key: str, required: bool = False, max_len: int = 255,
               min_len: int = 0, pattern: Optional[re.Pattern] = None,
               pattern_msg: str = "Invalid format.", lower: bool = False) -> Optional[str]:
        """Validate a trimmed string field."""
        value = self._get(key, required)
        if value is _MISSING:
            return "" if key in self.data and not required else None
        if not isinstance(value, str):
            self.errors[key] = "Must be text."
            return None
        value = value.strip()
        if lower:
            value = value.lower()
        if len(value) > max_len:
            self.errors[key] = f"Must be at most {max_len} characters."
        elif len(value) < min_len:
            self.errors[key] = f"Must be at least {min_len} characters."
        elif pattern and not pattern.match(value):
            self.errors[key] = pattern_msg
        return value

    def email(self, key: str, required: bool = False) -> Optional[str]:
        """Validate an email address (lower-cased)."""
        return self.string(key, required, max_len=254, pattern=EMAIL_RE,
                           pattern_msg="Enter a valid email address.", lower=True)

    def choice(self, key: str, options: Iterable[str], required: bool = False) -> Optional[str]:
        """Validate that a value is one of the allowed options."""
        value = self._get(key, required)
        if value is _MISSING:
            return None
        options = list(options)
        if value not in options:
            self.errors[key] = f"Must be one of: {', '.join(options)}."
            return None
        return value

    def date(self, key: str, required: bool = False) -> Optional[date]:
        """Validate an ISO date (YYYY-MM-DD)."""
        value = self._get(key, required)
        if value is _MISSING:
            return None
        try:
            return date.fromisoformat(str(value)[:10])
        except ValueError:
            self.errors[key] = "Must be a date in YYYY-MM-DD format."
            return None

    def decimal(self, key: str, required: bool = False, min_value: Optional[Decimal] = None,
                max_value: Optional[Decimal] = None, exclusive_min: bool = False) -> Optional[Decimal]:
        """Validate a numeric value with optional bounds."""
        value = self._get(key, required)
        if value is _MISSING:
            return None
        if isinstance(value, bool):
            self.errors[key] = "Must be a number."
            return None
        try:
            number = Decimal(str(value))
        except (InvalidOperation, ValueError):
            self.errors[key] = "Must be a number."
            return None
        if not number.is_finite():
            self.errors[key] = "Must be a number."
            return None
        if min_value is not None and (number <= min_value if exclusive_min else number < min_value):
            self.errors[key] = f"Must be greater than {min_value}." if exclusive_min else f"Must be at least {min_value}."
        elif max_value is not None and number > max_value:
            self.errors[key] = f"Must be at most {max_value}."
        return number

    def integer(self, key: str, required: bool = False) -> Optional[int]:
        """Validate a positive integer id."""
        value = self._get(key, required)
        if value is _MISSING:
            return None
        if isinstance(value, bool):
            self.errors[key] = "Must be a whole number."
            return None
        try:
            number = int(str(value))
        except ValueError:
            self.errors[key] = "Must be a whole number."
            return None
        if number <= 0:
            self.errors[key] = "Must be a positive number."
        return number

    def int_list(self, key: str, required: bool = False) -> Optional[list[int]]:
        """Validate a list of positive integer ids (deduplicated, order kept)."""
        value = self.data.get(key, _MISSING)
        if value is _MISSING or value is None:
            if required and not (self.partial and key not in self.data):
                self.errors[key] = "This field is required."
            return None
        if not isinstance(value, list) or not all(isinstance(i, int) and not isinstance(i, bool) and i > 0 for i in value):
            self.errors[key] = "Must be a list of ids."
            return None
        return list(dict.fromkeys(value))

    def add_error(self, key: str, message: str) -> None:
        """Record a cross-field error."""
        self.errors.setdefault(key, message)

    def raise_if_errors(self) -> None:
        """Raise a single ValidationError listing every invalid field."""
        if self.errors:
            raise ValidationError("Please correct the highlighted fields.", self.errors)


def parse_id(value: str, name: str = "id") -> int:
    """Parse a numeric path parameter."""
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"Invalid {name}.") from exc
    if number <= 0:
        raise ValidationError(f"Invalid {name}.")
    return number


def query_int(query: dict[str, str], key: str) -> Optional[int]:
    """Parse an optional integer query-string filter."""
    if key not in query or query[key] == "":
        return None
    return parse_id(query[key], key)


def query_date(query: dict[str, str], key: str) -> Optional[date]:
    """Parse an optional date query-string filter."""
    if key not in query or query[key] == "":
        return None
    try:
        return date.fromisoformat(query[key])
    except ValueError as exc:
        raise ValidationError(f"Invalid {key}; use YYYY-MM-DD.") from exc
