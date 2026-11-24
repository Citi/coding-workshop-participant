"""Budget engine: rounding, utilization, completion, divergence and rollups (spec 9.3)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from engine_factories import make_deliverable, make_project

from app.engines.budget import (
    budget_totals,
    completion_mean,
    completion_pct,
    department_rollups,
    money,
    project_budget,
    round_pct,
    utilization_pct,
)
from app.engines.types import BudgetTotals, DepartmentBudget


class TestRounding:
    """Percentages: one decimal, half up. Money: two decimals."""

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            (Decimal("12.25"), "12.3"),  # half up, where banker's rounding would give 12.2
            (Decimal("12.35"), "12.4"),
            (Decimal("0.05"), "0.1"),
            (Decimal("0.04"), "0.0"),
            (Decimal("33.3333"), "33.3"),
            (Decimal("99.95"), "100.0"),
            (Decimal("-0.05"), "-0.1"),
            (75, "75.0"),
            (0.15, "0.2"),  # floats go through str, so 0.15 is not 0.1499...
        ],
    )
    def test_round_pct_is_half_up_to_one_decimal(self, value: Decimal | int | float, expected: str) -> None:
        assert str(round_pct(value)) == expected

    def test_money_has_two_decimals(self) -> None:
        assert str(money(5)) == "5.00"
        assert str(money(Decimal("1.005"))) == "1.01"

    def test_utilization_and_completion_helpers(self) -> None:
        assert utilization_pct(Decimal("1.00"), Decimal("2000.00")) == Decimal("0.1")  # 0.05 rounds up
        assert utilization_pct(Decimal("5.00"), Decimal("0")) is None
        assert completion_pct([]) == Decimal("0.0")
        assert completion_pct([make_deliverable(1, pct=pct) for pct in (0, 0, 0, 1)]) == Decimal("0.3")  # 0.25

    def test_completion_mean_is_exact(self) -> None:
        # 19 deliverables at 100% and one at 99%: the mean is 99.95, which completion_pct shows as 100.0.
        deliverables = [make_deliverable(i, pct=100) for i in range(19)] + [make_deliverable(19, pct=99)]
        assert completion_mean(deliverables) == Decimal("99.95")
        assert completion_pct(deliverables) == Decimal("100.0")
        assert completion_mean([]) == Decimal("0")
        assert completion_mean(make_deliverable(i, pct=100) for i in range(3)) == Decimal("100")


class TestProjectBudget:
    """Per project: spend, remaining, utilization, completion and divergence."""

    def test_alpha_from_the_seed(self) -> None:
        alpha = make_project(1, planned="400000.00")
        deliverables = [make_deliverable(i, pct=pct) for i, pct in enumerate((100, 40, 20, 0, 0, 50), start=1)]
        budget = project_budget(alpha, deliverables, Decimal("300000.00"))
        assert budget.actual_spend == Decimal("300000.00")
        assert budget.remaining == Decimal("100000.00")
        assert (budget.utilization_pct, budget.completion_pct, budget.divergence_pp) == (
            Decimal("75.0"),
            Decimal("35.0"),
            Decimal("40.0"),
        )
        assert (budget.project_name, budget.department_name, budget.status) == ("Project 1", "Engineering", "ACTIVE")

    def test_zero_planned_budget(self) -> None:
        budget = project_budget(make_project(1, planned=0), [make_deliverable(1, pct=40)], Decimal("500"))
        assert (budget.utilization_pct, budget.divergence_pp) == (None, None)
        assert budget.planned_budget == Decimal("0.00")
        assert budget.remaining == Decimal("-500.00")
        assert budget.completion_pct == Decimal("40.0")

    def test_no_deliverables_and_no_spend(self) -> None:
        budget = project_budget(make_project(1), [], 0)
        assert (budget.actual_spend, budget.remaining) == (Decimal("0.00"), Decimal("100000.00"))
        assert (budget.utilization_pct, budget.completion_pct, budget.divergence_pp) == (
            Decimal("0.0"),
            Decimal("0.0"),
            Decimal("0.0"),
        )

    def test_overspend(self) -> None:
        budget = project_budget(make_project(4, planned="200000.00"), [], Decimal("210000.00"))
        assert (budget.utilization_pct, budget.remaining) == (Decimal("105.0"), Decimal("-10000.00"))

    def test_only_this_projects_deliverables_count(self) -> None:
        deliverables = [make_deliverable(1, project_id=1, pct=80), make_deliverable(2, project_id=2, pct=0)]
        assert project_budget(make_project(1), deliverables, 0).completion_pct == Decimal("80.0")


class TestDepartmentRollups:
    """Per department: sums, and completion weighted by planned budget."""

    def test_completion_is_weighted_by_planned_budget(self) -> None:
        big = project_budget(make_project(1, planned="300000.00"), [make_deliverable(1, pct=100)], Decimal("150000"))
        small = project_budget(make_project(2, planned="100000.00"), [make_deliverable(2, project_id=2, pct=0)], 0)
        rollup = department_rollups([big, small])[1]
        assert rollup == DepartmentBudget(
            department_id=1,
            department_name="Engineering",
            planned_budget=Decimal("400000.00"),
            actual_spend=Decimal("150000.00"),
            remaining=Decimal("250000.00"),
            utilization_pct=Decimal("37.5"),
            completion_pct=Decimal("75.0"),  # the plain mean would be 50.0
            project_count=2,
        )

    def test_department_without_planned_budget_uses_the_plain_mean(self) -> None:
        first = project_budget(make_project(1, planned=0), [make_deliverable(1, pct=100)], Decimal("10"))
        second = project_budget(make_project(2, planned=0), [make_deliverable(2, project_id=2, pct=25)], 0)
        rollup = department_rollups([first, second])[1]
        assert (rollup.utilization_pct, rollup.completion_pct, rollup.remaining) == (
            None,
            Decimal("62.5"),
            Decimal("-10.00"),
        )

    def test_one_rollup_per_department_ordered_by_name(self) -> None:
        budgets = [
            project_budget(make_project(1, department_id=3, department_name="Finance"), [], 0),
            project_budget(make_project(2, department_id=1, department_name="engineering"), [], 0),
            project_budget(make_project(3, department_id=3, department_name="Finance"), [], 0),
        ]
        rollups = department_rollups(budgets)
        assert list(rollups) == [1, 3]
        assert rollups[3].project_count == 2


class TestBudgetTotals:
    """Portfolio totals."""

    def test_totals_across_projects(self) -> None:
        budgets = [
            project_budget(make_project(1, planned="400000.00"), [], Decimal("300000.00")),
            project_budget(make_project(2, planned="200000.00"), [], Decimal("210000.00")),
        ]
        assert budget_totals(budgets) == BudgetTotals(
            planned_budget=Decimal("600000.00"),
            actual_spend=Decimal("510000.00"),
            remaining=Decimal("90000.00"),
            utilization_pct=Decimal("85.0"),
        )

    def test_empty_portfolio(self) -> None:
        assert budget_totals([]) == BudgetTotals(Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), None)
