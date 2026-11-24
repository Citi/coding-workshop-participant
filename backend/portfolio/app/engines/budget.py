"""Budget engine: spend against plan and progress per project and department (spec section 9.3).

Money stays ``Decimal`` end to end and is rounded to cents. Percentages are
rounded to one decimal place, half up, by ``round_pct``. Spend is the sum of a
project's budget entries; there is no stored actual-spend column to drift.
"""

from __future__ import annotations

from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal

from app.engines.types import (
    BudgetTotals,
    DeliverableFact,
    DepartmentBudget,
    ProjectBudget,
    ProjectFact,
)

__all__ = [
    "BudgetTotals",
    "DepartmentBudget",
    "ProjectBudget",
    "budget_totals",
    "completion_mean",
    "completion_pct",
    "department_rollups",
    "money",
    "project_budget",
    "round_pct",
    "utilization_pct",
]

_ONE_DECIMAL = Decimal("0.1")
_CENTS = Decimal("0.01")
_ZERO = Decimal("0")
_HUNDRED = Decimal("100")


def round_pct(value: Decimal | int | float) -> Decimal:
    """Round a percentage to one decimal place, half up: 12.25 -> 12.3, 0.05 -> 0.1.

    Floats are converted through ``str`` so that 0.15 rounds to 0.2, as written.
    """
    number = value if isinstance(value, Decimal) else Decimal(str(value))
    return number.quantize(_ONE_DECIMAL, rounding=ROUND_HALF_UP)


def money(value: Decimal | int) -> Decimal:
    """Return an amount as a ``Decimal`` with exactly two decimal places."""
    return Decimal(value).quantize(_CENTS, rounding=ROUND_HALF_UP)


def utilization_pct(actual_spend: Decimal, planned_budget: Decimal) -> Decimal | None:
    """Return spend as a percentage of plan, or ``None`` when nothing is planned."""
    if planned_budget <= 0:
        return None
    return round_pct(Decimal(actual_spend) * _HUNDRED / Decimal(planned_budget))


def completion_mean(deliverables: Iterable[DeliverableFact]) -> Decimal:
    """Return the exact, unrounded mean completion of the deliverables, or 0 when there are none.

    The risk engine decides whether a project is incomplete on this value, so a
    deliverable at 99% still counts when the rounded mean reads 100.0.
    """
    values = [deliverable.completion_percentage for deliverable in deliverables]
    if not values:
        return _ZERO
    return Decimal(sum(values)) / len(values)


def completion_pct(deliverables: Iterable[DeliverableFact]) -> Decimal:
    """Return the mean completion of the deliverables rounded to one decimal, or 0.0 when there are none."""
    return round_pct(completion_mean(deliverables))


def project_budget(
    project: ProjectFact, deliverables: Iterable[DeliverableFact], actual_spend: Decimal | int
) -> ProjectBudget:
    """Compute one project's spend, remaining budget, utilization, completion and divergence.

    Only deliverables of ``project`` count towards completion, so the caller may
    pass a wider list. ``divergence_pp`` is utilization minus completion, both
    already rounded, in percentage points.
    """
    planned = money(project.planned_budget)
    actual = money(actual_spend)
    utilization = utilization_pct(actual, planned)
    completion = completion_pct(item for item in deliverables if item.project_id == project.id)
    return ProjectBudget(
        project_id=project.id,
        project_name=project.name,
        department_id=project.department_id,
        department_name=project.department_name,
        status=project.status,
        planned_budget=planned,
        actual_spend=actual,
        remaining=planned - actual,
        utilization_pct=utilization,
        completion_pct=completion,
        divergence_pp=None if utilization is None else utilization - completion,
    )


def department_rollups(project_budgets: Iterable[ProjectBudget]) -> dict[int, DepartmentBudget]:
    """Sum planned and actual spend per department, ordered by department name.

    Department completion is the mean of its projects' completion weighted by
    planned budget. If every project in the department has a zero planned
    budget, the weights are all zero and the plain mean is used instead.
    """
    groups: dict[int, list[ProjectBudget]] = {}
    for item in project_budgets:
        groups.setdefault(item.department_id, []).append(item)

    rollups: list[DepartmentBudget] = []
    for department_id, items in groups.items():
        planned = sum((item.planned_budget for item in items), _ZERO)
        actual = sum((item.actual_spend for item in items), _ZERO)
        if planned > 0:
            weighted = sum((item.completion_pct * item.planned_budget for item in items), _ZERO)
            completion = round_pct(weighted / planned)
        else:
            completion = round_pct(sum((item.completion_pct for item in items), _ZERO) / len(items))
        rollups.append(
            DepartmentBudget(
                department_id=department_id,
                department_name=items[0].department_name,
                planned_budget=money(planned),
                actual_spend=money(actual),
                remaining=money(planned - actual),
                utilization_pct=utilization_pct(actual, planned),
                completion_pct=completion,
                project_count=len(items),
            )
        )
    rollups.sort(key=lambda rollup: (rollup.department_name.lower(), rollup.department_id))
    return {rollup.department_id: rollup for rollup in rollups}


def budget_totals(project_budgets: Iterable[ProjectBudget]) -> BudgetTotals:
    """Sum planned and actual spend over every project in the portfolio."""
    items = list(project_budgets)
    planned = sum((item.planned_budget for item in items), _ZERO)
    actual = sum((item.actual_spend for item in items), _ZERO)
    return BudgetTotals(
        planned_budget=money(planned),
        actual_spend=money(actual),
        remaining=money(planned - actual),
        utilization_pct=utilization_pct(actual, planned),
    )
