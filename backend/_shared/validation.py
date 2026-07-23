"""
Input validation.

Rules are declared as a dict of field -> spec and checked in one pass, so a bad
request comes back with *every* problem at once rather than making the user fix
one field per round-trip.

    spec = {
        "name":   {"type": "string", "required": True, "min_length": 3},
        "status": {"type": "enum", "values": PROJECT_STATUSES},
        "budget": {"type": "decimal", "min": 0},
    }
    clean = validate(payload, spec)      # raises ValidationError on failure
"""

import re
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")


class ValidationError(Exception):
    """Carries per-field messages so the API can return them as `fieldErrors`."""

    def __init__(self, field_errors, message="Validation failed"):
        super().__init__(message)
        self.message = message
        self.field_errors = field_errors


def _check_string(value, spec, field, errors):
    if not isinstance(value, str):
        errors[field] = "Must be text"
        return None

    cleaned = value.strip()
    if spec.get("required") and not cleaned:
        errors[field] = "This field is required"
        return None

    min_length = spec.get("min_length")
    if min_length and len(cleaned) < min_length:
        errors[field] = f"Must be at least {min_length} characters"
        return None

    max_length = spec.get("max_length")
    if max_length and len(cleaned) > max_length:
        errors[field] = f"Must be {max_length} characters or fewer"
        return None

    return cleaned


def _check_email(value, spec, field, errors):
    cleaned = _check_string(value, spec, field, errors)
    if cleaned is None:
        return None
    # Stored lowercase so uniqueness is genuinely case-insensitive.
    cleaned = cleaned.lower()
    if not EMAIL_RE.match(cleaned):
        errors[field] = "Enter a valid email address"
        return None
    return cleaned


def _check_integer(value, spec, field, errors):
    try:
        # bool is a subclass of int; True would otherwise pass as 1.
        if isinstance(value, bool):
            raise TypeError
        number = int(value)
    except (TypeError, ValueError):
        errors[field] = "Must be a whole number"
        return None

    if "min" in spec and number < spec["min"]:
        errors[field] = f"Must be {spec['min']} or more"
        return None
    if "max" in spec and number > spec["max"]:
        errors[field] = f"Must be {spec['max']} or less"
        return None
    return number


def _check_decimal(value, spec, field, errors):
    try:
        # Via str so float noise (0.1 + 0.2) never enters a money column.
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        errors[field] = "Must be a number"
        return None

    if not number.is_finite():
        errors[field] = "Must be a number"
        return None
    if "min" in spec and number < Decimal(str(spec["min"])):
        errors[field] = f"Must be {spec['min']} or more"
        return None
    if "max" in spec and number > Decimal(str(spec["max"])):
        errors[field] = f"Must be {spec['max']} or less"
        return None
    return number


def _check_uuid(value, spec, field, errors):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        errors[field] = "Must be a valid id"
        return None


def _check_date(value, spec, field, errors):
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        errors[field] = "Must be a date in YYYY-MM-DD format"
        return None


def _check_enum(value, spec, field, errors):
    allowed = spec.get("values", ())
    if value not in allowed:
        errors[field] = f"Must be one of: {', '.join(map(str, allowed))}"
        return None
    return value


def _check_boolean(value, spec, field, errors):
    if isinstance(value, bool):
        return value
    if str(value).lower() in ("true", "1", "yes"):
        return True
    if str(value).lower() in ("false", "0", "no"):
        return False
    errors[field] = "Must be true or false"
    return None


_CHECKS = {
    "string": _check_string,
    "email": _check_email,
    "integer": _check_integer,
    "decimal": _check_decimal,
    "uuid": _check_uuid,
    "date": _check_date,
    "enum": _check_enum,
    "boolean": _check_boolean,
}


def validate(payload, spec, *, partial=False):
    """Validates `payload` against `spec` and returns the cleaned values.

    Args:
        payload: the parsed request body. A non-dict is rejected outright.
        spec:    field -> rule mapping (see module docstring).
        partial: for PATCH/PUT -- absent fields are skipped instead of being
                 reported as missing. Fields that ARE present are still checked.

    Returns:
        dict of cleaned values, containing only the fields that were supplied.

    Raises:
        ValidationError: with one message per offending field.
    """
    if not isinstance(payload, dict):
        raise ValidationError({}, "Request body must be a JSON object")

    errors = {}
    clean = {}

    for field, rules in spec.items():
        present = field in payload
        value = payload.get(field)

        if not present or value is None:
            # A required field is only "missing" on a full validation; during a
            # partial update, not mentioning a field means "leave it alone".
            if rules.get("required") and not partial:
                errors[field] = "This field is required"
            elif present and value is None and rules.get("nullable", True):
                clean[field] = None
            continue

        check = _CHECKS.get(rules.get("type", "string"))
        if check is None:
            raise ValueError(f"Unknown validation type for field '{field}'")

        result = check(value, rules, field, errors)
        if field not in errors:
            clean[field] = result

    if errors:
        raise ValidationError(errors)

    return clean


def parse_body(event):
    """Parses the JSON request body, tolerating an empty one.

    Raises:
        ValidationError: when the body is present but is not valid JSON.
    """
    import json

    raw = event.get("body")
    if not raw:
        return {}

    if event.get("isBase64Encoded"):
        import base64

        raw = base64.b64decode(raw).decode("utf-8")

    try:
        return json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise ValidationError({}, "Request body is not valid JSON") from exc
