"""Unit tests for the pure deliverable rules and request schemas (no database)."""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.core.validation import format_validation_errors
from app.deliverables.rules import direct_prerequisites, format_ids, is_overdue
from app.deliverables.schemas import DeliverableRequest
from app.projects.schemas import ProjectRequest

TODAY = date(2026, 6, 15)


def validation_details(model, data) -> dict:
    with pytest.raises(PydanticValidationError) as exc:
        model.model_validate(data)
    return format_validation_errors(exc.value)


class TestIsOverdue:
    @pytest.mark.parametrize(
        "status, due_date, expected",
        [
            ("not_started", date(2026, 6, 14), True),
            ("in_progress", date(2026, 1, 1), True),
            ("blocked", date(2026, 6, 14), True),
            ("in_progress", TODAY, False),  # due today is not overdue yet
            ("not_started", date(2026, 6, 16), False),
            ("completed", date(2026, 1, 1), False),  # completed work is never overdue
        ],
    )
    def test_rule(self, status, due_date, expected):
        assert is_overdue(status, due_date, TODAY) is expected


class TestDirectPrerequisites:
    def test_keeps_depth_one_entries_without_depth(self):
        chain = [
            {"id": 4, "name": "C", "depth": 1},
            {"id": 2, "name": "A", "depth": 1},
            {"id": 3, "name": "B", "depth": 2},
        ]
        assert direct_prerequisites(chain) == [{"id": 4, "name": "C"}, {"id": 2, "name": "A"}]

    def test_empty_chain(self):
        assert direct_prerequisites([]) == []


class TestFormatIds:
    def test_sorted_and_comma_separated(self):
        assert format_ids({12, 3, 7}) == "3, 7, 12"
        assert format_ids([5]) == "5"


class TestDeliverableRequest:
    BASE = {"project_id": 1, "name": " Spec ", "due_date": "2026-07-01"}

    def test_defaults_and_trimming(self):
        model = DeliverableRequest.model_validate(self.BASE)
        assert (model.name, model.description, model.status) == ("Spec", "", "not_started")
        assert (model.is_key, model.owner_id, model.depends_on_ids) == (False, None, [])

    def test_dependency_ids_keep_their_order(self):
        assert DeliverableRequest.model_validate({**self.BASE, "depends_on_ids": [9, 2]}).depends_on_ids == [9, 2]

    @pytest.mark.parametrize(
        "value, message",
        [
            ([3, 3], "Must not contain duplicate ids"),
            ([0], "Must be a list of deliverable ids"),
            (["x"], "Must be a list of deliverable ids"),
            ([True], "Must be a list of deliverable ids"),
            (["2"], "Must be a list of deliverable ids"),
            ([2.0], "Must be a list of deliverable ids"),
            ("1,2", "Must be a list of deliverable ids"),
            (None, "Must be a list of deliverable ids"),
        ],
    )
    def test_dependency_errors_are_reported_on_the_field(self, value, message):
        assert validation_details(DeliverableRequest, {**self.BASE, "depends_on_ids": value}) == {
            "depends_on_ids": message
        }

    @pytest.mark.parametrize(
        "field, value",
        [("project_id", True), ("project_id", "1"), ("project_id", 1.0), ("owner_id", True), ("owner_id", "2")],
    )
    def test_ids_must_be_json_integers(self, field, value):
        assert validation_details(DeliverableRequest, {**self.BASE, field: value}) == {field: "Must be a whole number"}

    def test_owner_may_be_null(self):
        assert DeliverableRequest.model_validate({**self.BASE, "owner_id": None}).owner_id is None

    @pytest.mark.parametrize(
        "due_date",
        [0, "0", 1782864000, "1782864000", "2026-07-01T00:00:00", "20260701", "2026-7-1", "2026-02-30", None],
    )
    def test_due_date_must_be_yyyy_mm_dd_text(self, due_date):
        details = validation_details(DeliverableRequest, {**self.BASE, "due_date": due_date})
        assert details == {"due_date": "Must be a date in YYYY-MM-DD format"}


class TestProjectRequest:
    BASE = {"name": "Apollo", "department": "Sales", "start_date": "2026-01-01", "end_date": "2026-12-31"}

    def test_defaults(self):
        model = ProjectRequest.model_validate(self.BASE)
        assert (model.description, model.status, model.budget) == ("", "planned", Decimal("0"))

    def test_end_date_before_start_date_is_reported_on_end_date(self):
        details = validation_details(ProjectRequest, {**self.BASE, "end_date": "2025-12-31"})
        assert details == {"end_date": "Must be on or after start_date"}

    def test_date_order_is_not_checked_when_start_date_is_invalid(self):
        assert set(validation_details(ProjectRequest, {**self.BASE, "start_date": "soon"})) == {"start_date"}

    @pytest.mark.parametrize("field", ["start_date", "end_date"])
    @pytest.mark.parametrize("value", [0, "0", 1767225600, "2026-01-01T00:00:00", "2026-1-1"])
    def test_dates_must_be_yyyy_mm_dd_text(self, field, value):
        details = validation_details(ProjectRequest, {**self.BASE, field: value})
        assert details == {field: "Must be a date in YYYY-MM-DD format"}

    def test_valid_dates_are_parsed(self):
        model = ProjectRequest.model_validate(self.BASE)
        assert (model.start_date, model.end_date) == (date(2026, 1, 1), date(2026, 12, 31))

    @pytest.mark.parametrize("budget", [-0.01, 1000000000000, 1.005, float("nan"), True])
    def test_invalid_budget(self, budget):
        assert set(validation_details(ProjectRequest, {**self.BASE, "budget": budget})) == {"budget"}

    @pytest.mark.parametrize(
        "budget, expected",
        [(0, Decimal("0")), (12.5, Decimal("12.5")), (999999999999.99, Decimal("999999999999.99"))],
    )
    def test_valid_budget(self, budget, expected):
        assert ProjectRequest.model_validate({**self.BASE, "budget": budget}).budget == expected
