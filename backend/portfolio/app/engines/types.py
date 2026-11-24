"""Frozen dataclasses shared by the analytics engines.

Input facts (``ProjectFact``, ``DeliverableFact``, ``DependencyEdge`` and
``AllocationFact``) are plain copies of database rows, gathered into one
``PortfolioSnapshot`` by ``app.services.portfolio.load_snapshot``. The engines
take these facts plus an ``as_of`` date and return the result types defined
below. Nothing in the engines package imports the database, SQLAlchemy or
FastAPI layers, so every engine is a pure, deterministic function.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

# Deliverable statuses the engines reason about.
DONE = "DONE"
BLOCKED = "BLOCKED"

# Capacity statuses (spec section 9.2).
OVER_ALLOCATED = "OVER_ALLOCATED"
FULLY_ALLOCATED = "FULLY_ALLOCATED"
AVAILABLE = "AVAILABLE"


# ---------------------------------------------------------------------------
# Input facts
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProjectFact:
    """One project row with its department and project manager names."""

    id: int
    name: str
    description: str | None
    department_id: int
    department_name: str
    project_manager_id: int | None
    project_manager_name: str | None
    status: str
    start_date: date
    end_date: date
    planned_budget: Decimal


@dataclass(frozen=True)
class DeliverableFact:
    """One deliverable row with its assignee's name."""

    id: int
    project_id: int
    title: str
    status: str
    completion_percentage: int
    start_date: date | None
    due_date: date
    assigned_user_id: int | None = None
    assigned_user_name: str | None = None
    blocked_reason: str | None = None


@dataclass(frozen=True)
class DependencyEdge:
    """A directed edge: ``predecessor_id`` must finish before ``successor_id`` can."""

    id: int
    predecessor_id: int
    successor_id: int


@dataclass(frozen=True)
class AllocationFact:
    """A share of one person's time on a project, optionally on one deliverable.

    Both dates are inclusive.
    """

    id: int
    user_id: int
    user_name: str
    user_department_id: int | None
    project_id: int
    deliverable_id: int | None
    allocation_percentage: int
    start_date: date
    end_date: date


@dataclass(frozen=True)
class PortfolioSnapshot:
    """Every fact the engines need, loaded once per request."""

    projects: tuple[ProjectFact, ...] = ()
    deliverables: tuple[DeliverableFact, ...] = ()
    dependencies: tuple[DependencyEdge, ...] = ()
    allocations: tuple[AllocationFact, ...] = ()
    spend_by_project: Mapping[int, Decimal] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Dependency results (spec section 9.1)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ImpactedItem:
    """A deliverable held up by a blocked or overdue deliverable upstream of it.

    ``depth`` is the number of edges from the root cause (1 = direct successor).
    When several root causes reach the item, the nearest one is reported and a
    tie goes to the lowest root id.
    """

    id: int
    title: str
    project_id: int
    depth: int
    caused_by_id: int
    caused_by_title: str


@dataclass(frozen=True)
class DependencyAnalysis:
    """Root causes and the downstream deliverables they put at risk.

    ``impacted`` is ordered by depth, then id. ``held_up_by_root`` maps each
    root cause to the not-DONE deliverables downstream of it (in any project,
    ordered by depth, then id), which is what "holds up N deliverables" counts.
    """

    root_cause_ids: tuple[int, ...]
    impacted: Mapping[int, ImpactedItem]
    held_up_by_root: Mapping[int, tuple[int, ...]]


# ---------------------------------------------------------------------------
# Capacity results (spec section 9.2)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Segment:
    """A date range (both ends inclusive) in which one person's active allocations do not change."""

    start_date: date
    end_date: date
    load: int
    allocation_ids: tuple[int, ...]


@dataclass(frozen=True)
class EmployeeCapacity:
    """One person's load over time, conflict windows (load above 100) and status."""

    user_id: int
    user_name: str
    department_id: int | None
    peak_load: int
    current_load: int
    segments: tuple[Segment, ...]
    conflicts: tuple[Segment, ...]
    status: str


# ---------------------------------------------------------------------------
# Budget results (spec section 9.3)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProjectBudget:
    """Spend against plan and progress for one project.

    Percentages have one decimal place; ``utilization_pct`` and
    ``divergence_pp`` are ``None`` when the planned budget is zero.
    """

    project_id: int
    project_name: str
    department_id: int
    department_name: str
    status: str
    planned_budget: Decimal
    actual_spend: Decimal
    remaining: Decimal
    utilization_pct: Decimal | None
    completion_pct: Decimal
    divergence_pp: Decimal | None


@dataclass(frozen=True)
class DepartmentBudget:
    """Planned and actual spend summed over a department's projects."""

    department_id: int
    department_name: str
    planned_budget: Decimal
    actual_spend: Decimal
    remaining: Decimal
    utilization_pct: Decimal | None
    completion_pct: Decimal
    project_count: int


@dataclass(frozen=True)
class BudgetTotals:
    """Planned and actual spend summed over the whole portfolio."""

    planned_budget: Decimal
    actual_spend: Decimal
    remaining: Decimal
    utilization_pct: Decimal | None


# ---------------------------------------------------------------------------
# Risk results (spec section 9.4)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RiskFactor:
    """Points scored by one risk factor, its cap and a one-line summary."""

    key: str
    label: str
    points: int
    max_points: int
    detail: str


@dataclass(frozen=True)
class RiskAssessment:
    """An explainable risk score: factors, evidence, impacted work and actions."""

    project_id: int
    project_name: str
    risk_score: int
    risk_level: str
    as_of: date
    factors: tuple[RiskFactor, ...]
    evidence: tuple[str, ...]
    impacted_deliverables: tuple[ImpactedItem, ...]
    recommended_actions: tuple[str, ...]

    @property
    def headline(self) -> str:
        """Return the first evidence line, which comes from the highest-scoring factor."""
        return self.evidence[0] if self.evidence else ""

    def factor(self, key: str) -> RiskFactor:
        """Return the factor with ``key`` (for example ``"schedule"``); raise ``KeyError`` if unknown."""
        for item in self.factors:
            if item.key == key:
                return item
        raise KeyError(key)


@dataclass(frozen=True)
class PortfolioAnalysis:
    """Every engine result for one snapshot and one ``as_of`` date, computed once."""

    as_of: date
    snapshot: PortfolioSnapshot
    dependencies: DependencyAnalysis
    capacity: Mapping[int, EmployeeCapacity]
    bottlenecks: Mapping[int, frozenset[int]]
    project_budgets: Mapping[int, ProjectBudget]
    department_budgets: Mapping[int, DepartmentBudget]
    budget_totals: BudgetTotals
    risks: Mapping[int, RiskAssessment]

    @property
    def over_allocated_count(self) -> int:
        """Return how many people have a conflict that has not ended yet."""
        return sum(1 for employee in self.capacity.values() if employee.status == OVER_ALLOCATED)

    def ranked_risks(self) -> list[RiskAssessment]:
        """Return every risk assessment, highest score first, then by project name."""
        return sorted(self.risks.values(), key=lambda risk: (-risk.risk_score, risk.project_name.lower()))
