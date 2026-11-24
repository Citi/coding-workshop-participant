"""Builders for engine facts and the spec's golden table, shared by the engine tests (not a test module).

Every date is an offset in days from the fixed analysis date ``T``, so tests
read like the seed tables in spec section 10.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, timedelta
from decimal import Decimal

from app.engines.types import (
    AllocationFact,
    DeliverableFact,
    DependencyEdge,
    PortfolioAnalysis,
    PortfolioSnapshot,
    ProjectFact,
    Segment,
)

#: The fixed analysis date used by every engine test.
T = date(2026, 11, 25)

#: Risk factor keys in the column order of the golden table.
FACTOR_KEYS = ("schedule", "blocked", "blast_radius", "resource", "budget", "deadline")

#: The golden table of spec section 10, by project name: schedule, blocked, blast radius, resource, budget and
#: deadline points, then score, level, completion % and utilization %. Copied from the spec by hand and never
#: derived from ``app.db.seed``, so a seed that drifts from the spec fails the golden tests.
GOLDEN: dict[str, tuple[int | str, ...]] = {
    "Project Alpha: Customer Payments Platform": (16, 10, 15, 12, 15, 10, 78, "CRITICAL", "35.0", "75.0"),
    "Project Beta: Brand Relaunch Campaign": (8, 0, 10, 8, 5, 0, 31, "MEDIUM", "50.0", "70.0"),
    "Project Gamma: Ledger Automation": (0, 0, 0, 0, 0, 0, 0, "LOW", "60.0", "55.0"),
    "Project Delta: Warehouse Tracking Rollout": (16, 10, 5, 0, 20, 10, 61, "HIGH", "55.0", "105.0"),
    "Project Epsilon: Onboarding Portal": (0, 0, 0, 0, 0, 0, 0, "LOW", "100.0", "95.0"),
}


def golden_row(analysis: PortfolioAnalysis, project_id: int) -> tuple[int | str, ...]:
    """Return one project's computed results in the column order of ``GOLDEN``."""
    risk = analysis.risks[project_id]
    budget = analysis.project_budgets[project_id]
    return (
        *(risk.factor(key).points for key in FACTOR_KEYS),
        risk.risk_score,
        risk.risk_level,
        str(budget.completion_pct),
        str(budget.utilization_pct),
    )


def project_ids_by_name(snapshot: PortfolioSnapshot) -> dict[str, int]:
    """Map each project name in the snapshot to its id."""
    return {project.name: project.id for project in snapshot.projects}


def day(offset: int) -> date:
    """Return the date ``offset`` days from ``T``."""
    return T + timedelta(days=offset)


def make_project(
    pid: int = 1,
    *,
    name: str | None = None,
    status: str = "ACTIVE",
    start: int = -60,
    end: int = 90,
    planned: str | int = "100000.00",
    department_id: int = 1,
    department_name: str = "Engineering",
) -> ProjectFact:
    """Build a project fact; ``start`` and ``end`` are offsets from ``T``."""
    return ProjectFact(
        id=pid,
        name=name or f"Project {pid}",
        description=None,
        department_id=department_id,
        department_name=department_name,
        project_manager_id=None,
        project_manager_name=None,
        status=status,
        start_date=day(start),
        end_date=day(end),
        planned_budget=Decimal(planned),
    )


def make_deliverable(
    did: int,
    *,
    project_id: int = 1,
    title: str | None = None,
    status: str = "IN_PROGRESS",
    pct: int | None = None,
    due: int = 30,
    assignee: int | None = None,
    assignee_name: str | None = None,
    reason: str | None = None,
) -> DeliverableFact:
    """Build a deliverable fact; ``due`` is an offset from ``T``. DONE defaults to 100%, others to 50%."""
    if pct is None:
        pct = 100 if status == "DONE" else 50
    return DeliverableFact(
        id=did,
        project_id=project_id,
        title=title or f"Deliverable {did}",
        status=status,
        completion_percentage=pct,
        start_date=None,
        due_date=day(due),
        assigned_user_id=assignee,
        assigned_user_name=assignee_name,
        blocked_reason=reason,
    )


def make_edge(predecessor: int, successor: int) -> DependencyEdge:
    """Build a dependency edge ``predecessor -> successor`` with a derived id."""
    return DependencyEdge(id=predecessor * 1000 + successor, predecessor_id=predecessor, successor_id=successor)


def make_allocation(
    aid: int,
    *,
    user_id: int = 1,
    user_name: str | None = None,
    project_id: int = 1,
    deliverable_id: int | None = None,
    pct: int = 50,
    start: int = 0,
    end: int = 10,
    department_id: int | None = 1,
) -> AllocationFact:
    """Build an allocation fact; ``start`` and ``end`` are inclusive offsets from ``T``."""
    return AllocationFact(
        id=aid,
        user_id=user_id,
        user_name=user_name or f"User {user_id}",
        user_department_id=department_id,
        project_id=project_id,
        deliverable_id=deliverable_id,
        allocation_percentage=pct,
        start_date=day(start),
        end_date=day(end),
    )


def make_snapshot(
    projects: Iterable[ProjectFact] = (),
    deliverables: Iterable[DeliverableFact] = (),
    edges: Iterable[DependencyEdge] = (),
    allocations: Iterable[AllocationFact] = (),
    spend: Mapping[int, Decimal | int | str] | None = None,
) -> PortfolioSnapshot:
    """Bundle facts into a snapshot; ``spend`` maps project id to actual spend."""
    return PortfolioSnapshot(
        projects=tuple(projects),
        deliverables=tuple(deliverables),
        dependencies=tuple(edges),
        allocations=tuple(allocations),
        spend_by_project={pid: Decimal(amount) for pid, amount in (spend or {}).items()},
    )


def spans(segments: Iterable[Segment]) -> list[tuple[int, int, int, tuple[int, ...]]]:
    """Describe segments as ``(start offset, end offset, load, allocation ids)`` for readable asserts."""
    return [
        ((segment.start_date - T).days, (segment.end_date - T).days, segment.load, segment.allocation_ids)
        for segment in segments
    ]
