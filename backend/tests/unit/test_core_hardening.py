"""Unit tests for the shared validation types, friendly messages and conflict mapping."""

import json
from decimal import Decimal
from types import SimpleNamespace
from typing import Annotated, Literal

import pytest
from pydantic import Field
from pydantic import ValidationError as PydanticValidationError

from app.core.errors import ValidationError
from app.core.http import Request, list_result
from app.core.validation import (
    ApiModel,
    Description,
    IsoDate,
    Name150,
    StrictId,
    format_validation_errors,
    parse_body,
    query_date,
    query_str,
)
from app.main import UNIQUE_CONSTRAINT_FIELDS, conflict_from


class _Body(ApiModel):
    name: Name150
    notes: Description = ""
    owner_id: StrictId | None = None
    due: IsoDate | None = None
    status: Literal["planned", "active"] = "planned"
    percent: Annotated[int, Field(ge=1, le=100)] = 1
    amount: Annotated[Decimal, Field(gt=0, decimal_places=2)] = Decimal("1")


def errors_for(**body):
    with pytest.raises(PydanticValidationError) as exc:
        _Body.model_validate({"name": "ok", **body})
    return format_validation_errors(exc.value)


class TestSharedTypes:
    def test_strict_ids_reject_booleans_text_and_floats(self):
        for bad in (True, "1", 1.0):
            assert errors_for(owner_id=bad) == {"owner_id": "Must be a whole number"}
        assert _Body.model_validate({"name": "ok", "owner_id": 3}).owner_id == 3

    def test_iso_dates_only(self):
        for bad in (0, "0", "20260215", "2026-02-15T10:00:00"):
            assert errors_for(due=bad) == {"due": "Must be a date in YYYY-MM-DD format"}
        assert str(_Body.model_validate({"name": "ok", "due": "2026-02-15"}).due) == "2026-02-15"

    def test_nul_characters_are_reported_on_the_field(self):
        assert errors_for(name="bad\x00name") == {"name": "Must not contain NUL characters"}
        assert errors_for(notes="x\x00") == {"notes": "Must not contain NUL characters"}


class TestFriendlyMessages:
    @pytest.mark.parametrize(
        ("body", "expected"),
        [
            ({"name": "x" * 151}, {"name": "Must be at most 150 characters"}),
            ({"status": "done"}, {"status": "Must be 'planned' or 'active'"}),
            ({"percent": 0}, {"percent": "Must be at least 1"}),
            ({"percent": 101}, {"percent": "Must be at most 100"}),
            ({"amount": 0}, {"amount": "Must be greater than 0"}),
            ({"amount": "1.234"}, {"amount": "Use at most 2 decimal places"}),
        ],
    )
    def test_limit_messages(self, body, expected):
        assert errors_for(**body) == expected

    def test_parse_body_uses_friendly_messages(self):
        with pytest.raises(ValidationError) as exc:
            parse_body(_Body, Request("POST", "/", body=json.dumps({"name": "", "percent": 500})))
        assert exc.value.details == {"name": "This field is required", "percent": "Must be at most 100"}


class TestQueryHardening:
    def test_query_date_requires_exact_iso_format(self):
        for bad in ("20260215", "2026-W07-7"):
            with pytest.raises(ValidationError):
                query_date(Request("GET", "/", query={"d": bad}), "d")

    def test_query_text_rejects_nul(self):
        with pytest.raises(ValidationError) as exc:
            query_str(Request("GET", "/", query={"search": "a\x00b"}), "search")
        assert exc.value.details == {"search": "Must not contain NUL characters"}


class TestEnvelopeAndConflicts:
    def test_list_result(self):
        assert list_result([1, 2]) == {"items": [1, 2], "total": 2}
        assert list_result([]) == {"items": [], "total": 0}

    @pytest.mark.parametrize(("constraint", "field"), sorted(UNIQUE_CONSTRAINT_FIELDS.items()))
    def test_known_unique_constraints_name_the_field(self, constraint, field):
        error = conflict_from(SimpleNamespace(diag=SimpleNamespace(constraint_name=constraint)))
        assert error.status == 409 and error.details == {field: "Already exists"}

    def test_unknown_constraint_still_409_without_details(self):
        error = conflict_from(SimpleNamespace(diag=SimpleNamespace(constraint_name="something_else")))
        assert error.status == 409 and error.details is None
