"""Unit tests for the project health / budget rules and the over-allocation rule."""

from datetime import date
from decimal import Decimal

import pytest

from app.projects.health import budget_summary, elapsed_percent, evaluate_health, progress_percent
from app.projects.metrics import enrich_project
from app.resources.utilization import enrich_resource, is_over_allocated

TODAY = date(2026, 6, 1)


def health(**overrides):
    args = dict(
        status="active",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        total=10,
        completed=5,
        overdue=0,
        blocked=0,
        today=TODAY,
    )
    args.update(overrides)
    return evaluate_health(**args)


class TestProgressAndElapsed:
    def test_progress(self):
        assert progress_percent(0, 0) == 0
        assert progress_percent(3, 1) == 33
        assert progress_percent(4, 4) == 100

    def test_elapsed(self):
        assert elapsed_percent(date(2026, 1, 1), date(2026, 1, 11), date(2025, 12, 1)) == 0
        assert elapsed_percent(date(2026, 1, 1), date(2026, 1, 11), date(2026, 1, 6)) == 50
        assert elapsed_percent(date(2026, 1, 1), date(2026, 1, 11), date(2026, 2, 1)) == 100
        assert elapsed_percent(date(2026, 1, 1), date(2026, 1, 1), date(2026, 1, 1)) == 0

    @pytest.mark.parametrize(
        ("total", "completed", "expected"),
        [(8, 1, 13), (8, 3, 38), (8, 5, 63), (8, 7, 88), (3, 2, 67), (200, 1, 1)],
    )
    def test_progress_rounds_halves_up_like_the_ui(self, total, completed, expected):
        # Python's round() rounds halves to even (1 of 8 -> 12, 5 of 8 -> 62); the UI's Math.round and
        # the budget % round them up, so the API does too.
        assert progress_percent(total, completed) == expected

    def test_elapsed_rounds_halves_up_like_the_ui(self):
        # 1 of 8 days -> 12.5%; 5 of 8 days -> 62.5%
        assert elapsed_percent(date(2026, 1, 1), date(2026, 1, 9), date(2026, 1, 2)) == 13
        assert elapsed_percent(date(2026, 1, 1), date(2026, 1, 9), date(2026, 1, 6)) == 63

    def test_rounding_mode_can_decide_the_slippage_rule(self):
        # 5 of 8 days elapsed = 62.5% -> 63; 21 of 50 done = 42%: 21 points behind -> at risk
        state, reasons = health(
            start_date=date(2026, 1, 1), end_date=date(2026, 1, 9), today=date(2026, 1, 6), total=50, completed=21
        )
        assert state == "at_risk"
        assert reasons == ["63% of the schedule has elapsed but only 42% of deliverables are complete"]


class TestHealth:
    def test_on_track(self):
        assert health() == ("on_track", [])

    @pytest.mark.parametrize("status", ["completed", "cancelled"])
    def test_closed_projects_have_no_health(self, status):
        assert health(status=status, end_date=date(2026, 1, 2)) == (None, [])

    def test_overdue_when_end_date_passed(self):
        state, reasons = health(end_date=date(2026, 5, 31))
        assert state == "overdue" and "has passed" in reasons[0]

    def test_at_risk_with_overdue_or_blocked_deliverables(self):
        assert health(overdue=2)[0] == "at_risk"
        state, reasons = health(blocked=1)
        assert state == "at_risk" and reasons == ["1 deliverable blocked"]

    def test_at_risk_when_schedule_slips_more_than_20_points(self):
        # ~42% of the year elapsed, 10% done -> slippage 32 points
        state, reasons = health(completed=1)
        assert state == "at_risk" and "schedule" in reasons[0]

    def test_slippage_of_exactly_20_points_is_still_on_track(self):
        # Jan 1 -> Jan 11 (10 days), today Jan 8 -> 70% elapsed; 5/10 done -> 50% (20 points)
        assert health(start_date=date(2026, 1, 1), end_date=date(2026, 1, 11), today=date(2026, 1, 8))[0] == "on_track"


class TestBudget:
    def test_under_budget(self):
        summary = budget_summary(Decimal("1000"), Decimal("250.5"))
        assert summary == {
            "budget_spent": Decimal("250.50"),
            "budget_remaining": Decimal("749.50"),
            "budget_used_percent": 25.1,
            "over_budget": False,
        }

    def test_over_budget(self):
        summary = budget_summary(Decimal("100"), Decimal("150"))
        assert summary["over_budget"] and summary["budget_used_percent"] == 150.0

    def test_zero_budget(self):
        assert budget_summary(0, 0)["budget_used_percent"] == 0.0
        spent = budget_summary(0, 10)
        assert spent["budget_used_percent"] is None and spent["over_budget"]


class TestEnrichment:
    def test_enrich_project_without_metrics(self):
        project = {
            "status": "planned",
            "start_date": date(2026, 7, 1),
            "end_date": date(2026, 9, 1),
            "budget": Decimal("10"),
        }
        enriched = enrich_project(project, None, today=TODAY)
        assert enriched["progress_percent"] == 0 and enriched["health"] == "on_track"
        assert enriched["team_size"] == 0 and enriched["budget_spent"] == Decimal("0.00")

    def test_over_allocation_threshold(self):
        assert not is_over_allocated(100) and is_over_allocated(101)
        enriched = enrich_resource({"id": 1}, {"total_allocation_percent": 120, "active_project_count": 2})
        assert enriched["is_over_allocated"] and enriched["active_project_count"] == 2
        assert enrich_resource({"id": 2}, None)["total_allocation_percent"] == 0
