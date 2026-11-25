"""Unit tests for the pure dashboard rules (no database)."""

from datetime import date
from decimal import Decimal

import pytest

from app.dashboard import rules


def enriched_project(project_id, name, **overrides):
    """A project row as ``app.projects.metrics.enrich_project`` returns it."""
    row = {
        "id": project_id,
        "name": name,
        "description": "",
        "department": "IT",
        "status": "active",
        "start_date": date(2026, 1, 1),
        "end_date": date(2026, 12, 31),
        "budget": Decimal("1000.00"),
        "created_at": None,
        "updated_at": None,
        "progress_percent": 50,
        "deliverables_total": 4,
        "deliverables_completed": 2,
        "deliverables_overdue": 1,
        "deliverables_blocked": 0,
        "key_deliverables_total": 1,
        "key_deliverables_completed": 1,
        "team_size": 2,
        "health": "on_track",
        "health_reasons": [],
        "budget_spent": Decimal("100.00"),
        "budget_remaining": Decimal("900.00"),
        "budget_used_percent": 10.0,
        "over_budget": False,
    }
    row.update(overrides)
    return row


def person(resource_id, full_name, total):
    """A resource row as ``app.resources.utilization.enrich_resource`` returns it (only the fields used here)."""
    return {
        "id": resource_id,
        "full_name": full_name,
        "total_allocation_percent": total,
        "is_over_allocated": total > 100,
    }


def budget_line(name, used, **overrides):
    return {"project_id": len(name), "project_name": name, "budget_used_percent": used, **overrides}


class TestHelpers:
    def test_pick_keeps_only_the_given_fields_in_order(self):
        assert list(rules.pick({"c": 3, "a": 1, "b": 2}, ("b", "a"))) == ["b", "a"]

    def test_count_by_lists_every_value_and_skips_others(self):
        items = [{"health": "at_risk"}, {"health": None}, {"health": "at_risk"}, {"health": "unknown"}]
        assert rules.count_by(items, "health", ("on_track", "at_risk", "overdue")) == {
            "on_track": 0,
            "at_risk": 2,
            "overdue": 0,
        }

    def test_count_by_without_items_is_all_zero(self):
        assert rules.count_by([], "status", ("planned", "active")) == {"planned": 0, "active": 0}


class TestProjectLists:
    def test_active_projects_by_end_date_then_name(self):
        projects = [
            enriched_project(1, "zeus", end_date=date(2026, 9, 1)),
            enriched_project(2, "Apollo", end_date=date(2026, 9, 1)),
            enriched_project(3, "Hermes", end_date=date(2026, 3, 1)),
            enriched_project(4, "Orion", status="planned", end_date=date(2026, 1, 1)),
            enriched_project(5, "Atlas", status="on_hold", end_date=date(2026, 1, 1)),
        ]
        summaries = rules.active_projects(projects)
        assert [summary["name"] for summary in summaries] == ["Hermes", "Apollo", "zeus"]
        assert all(tuple(summary) == rules.PROJECT_SUMMARY_FIELDS for summary in summaries)

    def test_at_risk_projects_overdue_first_then_end_date(self):
        projects = [
            enriched_project(1, "Late but at risk", health="at_risk", end_date=date(2026, 12, 1)),
            enriched_project(2, "Overdue", health="overdue", end_date=date(2026, 5, 1)),
            enriched_project(3, "Early risk", status="on_hold", health="at_risk", end_date=date(2026, 7, 1)),
            enriched_project(4, "Fine", health="on_track", end_date=date(2026, 1, 1)),
            enriched_project(5, "Closed", status="completed", health=None, end_date=date(2026, 1, 1)),
            enriched_project(6, "Older overdue", health="overdue", end_date=date(2026, 2, 1)),
        ]
        summaries = rules.at_risk_projects(projects)
        expected = ["Older overdue", "Overdue", "Early risk", "Late but at risk"]
        assert [summary["name"] for summary in summaries] == expected
        assert set(summaries[0]) == set(rules.PROJECT_SUMMARY_FIELDS)

    def test_no_projects(self):
        assert rules.active_projects([]) == [] and rules.at_risk_projects([]) == []


class TestDeliverableTotals:
    def test_adds_up_the_project_counters(self):
        projects = [
            enriched_project(1, "A"),
            enriched_project(
                2,
                "B",
                deliverables_total=3,
                deliverables_completed=0,
                deliverables_overdue=2,
                deliverables_blocked=1,
                key_deliverables_total=2,
                key_deliverables_completed=0,
            ),
        ]
        assert rules.deliverable_totals(projects) == {
            "total": 7,
            "completed": 2,
            "overdue": 3,
            "blocked": 1,
            "key_total": 3,
            "key_completed": 1,
        }

    def test_no_projects_means_zero_everywhere(self):
        assert rules.deliverable_totals([]) == dict.fromkeys(rules.DELIVERABLE_COUNTERS, 0)


class TestBudgetLines:
    def test_excludes_cancelled_projects_and_keeps_the_documented_fields(self):
        projects = [
            enriched_project(1, "Apollo", budget_used_percent=40.7),
            enriched_project(2, "Mercury", status="cancelled"),
        ]
        assert rules.budget_lines(projects) == [
            {
                "project_id": 1,
                "project_name": "Apollo",
                "status": "active",
                "budget": Decimal("1000.00"),
                "budget_spent": Decimal("100.00"),
                "budget_remaining": Decimal("900.00"),
                "budget_used_percent": 40.7,
                "over_budget": False,
            }
        ]

    def test_unknown_percent_first_then_highest_used_then_name(self):
        projects = [
            enriched_project(1, "Low", budget_used_percent=5.0),
            enriched_project(2, "zero budget, spent", budget=Decimal("0"), budget_used_percent=None, over_budget=True),
            enriched_project(3, "beta", budget_used_percent=50.0),
            enriched_project(4, "Over", budget_used_percent=120.5, over_budget=True),
            enriched_project(5, "Alpha", budget_used_percent=50.0),
            enriched_project(6, "Unused", budget_used_percent=0.0),
        ]
        order = [line["project_name"] for line in rules.budget_lines(projects)]
        assert order == ["zero budget, spent", "Over", "Alpha", "beta", "Low", "Unused"]


class TestBudgetTotals:
    def test_totals_and_rounded_used_percent(self):
        lines = [
            budget_line("A", 50.0, budget=Decimal("200.00"), budget_spent=Decimal("100.00"), over_budget=False),
            budget_line("B", 150.0, budget=Decimal("100.00"), budget_spent=Decimal("150.00"), over_budget=True),
            budget_line("C", 83.0, budget=Decimal("100.00"), budget_spent=Decimal("83.00"), over_budget=False),
        ]
        # 333 / 400 = 83.25% -> rounded half up (not half even) like a project's budget_used_percent
        assert rules.budget_totals(lines) == {
            "total_planned": Decimal("400.00"),
            "total_spent": Decimal("333.00"),
            "used_percent": 83.3,
            "over_budget_projects": 1,
        }

    def test_used_percent_is_zero_when_nothing_is_planned(self):
        lines = [budget_line("A", None, budget=Decimal("0.00"), budget_spent=Decimal("500.00"), over_budget=True)]
        totals = rules.budget_totals(lines)
        assert totals["used_percent"] == 0 and totals["total_spent"] == Decimal("500.00")

    def test_no_lines(self):
        assert rules.budget_totals([]) == {
            "total_planned": Decimal(0),
            "total_spent": Decimal(0),
            "used_percent": 0.0,
            "over_budget_projects": 0,
        }


class TestOverAllocated:
    @pytest.mark.parametrize("total, listed", [(100, False), (101, True)])
    def test_threshold(self, total, listed):
        assert bool(rules.over_allocated([person(1, "Priya Shah", total)])) is listed

    def test_highest_total_first_then_name(self):
        people = [person(1, "Omar", 110), person(2, "lena", 150), person(3, "Ann", 110), person(4, "Sam", 60)]
        assert [p["full_name"] for p in rules.over_allocated(people)] == ["lena", "Ann", "Omar"]
