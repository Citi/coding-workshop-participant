"""Analytics read models: one portfolio analysis per request, reshaped for the API.

Every analytics endpoint calls ``analyze`` exactly once per request: one
``load_snapshot`` (five queries) and one ``analyze_portfolio`` run over it.
The other functions only reshape that result. The single extra query is
``recent_activity``, which the dashboard runs only for roles that may read the
audit log.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import replace
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import PROJECT_STATUSES, AuditLog
from app.engines.capacity import analyze_capacity, compound_bottlenecks
from app.engines.risk import RISK_LEVELS, analyze_portfolio
from app.engines.types import (
    OVER_ALLOCATED,
    AllocationFact,
    DeliverableFact,
    EmployeeCapacity,
    PortfolioAnalysis,
    ProjectFact,
    RiskAssessment,
)
from app.errors import NotFound
from app.schemas.analytics import (
    BottleneckDeliverableOut,
    BudgetAnalyticsOut,
    BudgetSummaryOut,
    BudgetTotalsOut,
    CapacityOut,
    ConflictAllocationOut,
    ConflictOut,
    DashboardOut,
    DepartmentBudgetOut,
    DepartmentSpendOut,
    EmployeeCapacityOut,
    ImpactedDeliverableOut,
    ProjectBudgetOut,
    ProjectRiskOut,
    RiskFactorOut,
    RiskListOut,
    RiskSummaryOut,
    SegmentOut,
    TopRiskOut,
)
from app.schemas.audit_logs import AuditLogOut
from app.services.portfolio import load_snapshot

__all__ = [
    "RECENT_ACTIVITY_LIMIT",
    "RISK_LEVEL_ORDER",
    "TOP_RISKS_LIMIT",
    "analyze",
    "budget_overview",
    "capacity_overview",
    "clip_allocations",
    "dashboard",
    "project_risk",
    "recent_activity",
    "risk_ranking",
]

#: Number of audit events listed under recent activity on the dashboard.
RECENT_ACTIVITY_LIMIT = 10
#: Largest number of projects listed under top risks on the dashboard (only projects scoring above 0).
TOP_RISKS_LIMIT = 5
#: Risk levels from lowest to highest: LOW, MEDIUM, HIGH, CRITICAL.
RISK_LEVEL_ORDER: tuple[str, ...] = tuple(level for _, level in reversed(RISK_LEVELS))

# Newest first; the id breaks ties between events written in the same transaction.
_RECENT_ACTIVITY = select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())


# --- Loading ---------------------------------------------------------------------------------------


def analyze(db: Session, as_of: date) -> PortfolioAnalysis:
    """Load the whole portfolio once (five queries) and run every engine over it once."""
    return analyze_portfolio(load_snapshot(db), as_of)


def recent_activity(db: Session, limit: int = RECENT_ACTIVITY_LIMIT) -> list[AuditLog]:
    """Return the latest ``limit`` audit events, newest first, in one query."""
    return list(db.scalars(_RECENT_ACTIVITY.limit(limit)))


# --- Shared helpers --------------------------------------------------------------------------------


def _pct(value: Decimal | None) -> float | None:
    """Return a one-decimal percentage as a JSON number; ``None`` (undefined) stays ``None``."""
    return None if value is None else float(value)


def _factors(risk: RiskAssessment) -> list[RiskFactorOut]:
    """Return a risk assessment's six factors in display order."""
    return [
        RiskFactorOut(
            key=factor.key,
            label=factor.label,
            points=factor.points,
            max_points=factor.max_points,
            detail=factor.detail,
        )
        for factor in risk.factors
    ]


# --- Risk ------------------------------------------------------------------------------------------


def project_risk(analysis: PortfolioAnalysis, project_id: int) -> ProjectRiskOut:
    """Return one project's full risk detail (spec section 9.4); 404 when the project does not exist."""
    risk = analysis.risks.get(project_id)
    if risk is None:
        raise NotFound(f"Project {project_id} was not found.")
    return ProjectRiskOut(
        project_id=risk.project_id,
        project_name=risk.project_name,
        risk_score=risk.risk_score,
        risk_level=risk.risk_level,
        as_of=risk.as_of,
        factors=_factors(risk),
        evidence=list(risk.evidence),
        impacted_deliverables=[
            ImpactedDeliverableOut(id=item.id, title=item.title, depth=item.depth, caused_by=item.caused_by_title)
            for item in risk.impacted_deliverables
        ],
        recommended_actions=list(risk.recommended_actions),
    )


def risk_ranking(analysis: PortfolioAnalysis) -> RiskListOut:
    """Return every project's risk summary, highest score first, then by project name."""
    projects = {project.id: project for project in analysis.snapshot.projects}
    items = [
        RiskSummaryOut(
            project_id=risk.project_id,
            project_name=risk.project_name,
            department_name=projects[risk.project_id].department_name,
            status=projects[risk.project_id].status,
            risk_score=risk.risk_score,
            risk_level=risk.risk_level,
            factors=_factors(risk),
            headline=risk.headline,
        )
        for risk in analysis.ranked_risks()
    ]
    return RiskListOut(as_of=analysis.as_of, items=items)


# --- Budget ----------------------------------------------------------------------------------------


def budget_overview(analysis: PortfolioAnalysis) -> BudgetAnalyticsOut:
    """Return per-project budgets (by project id), department rollups (by name) and portfolio totals."""
    projects = [
        ProjectBudgetOut(
            project_id=budget.project_id,
            project_name=budget.project_name,
            department_id=budget.department_id,
            department_name=budget.department_name,
            status=budget.status,
            planned_budget=budget.planned_budget,
            actual_spend=budget.actual_spend,
            remaining=budget.remaining,
            utilization_pct=_pct(budget.utilization_pct),
            completion_pct=float(budget.completion_pct),
            divergence_pp=_pct(budget.divergence_pp),
        )
        for budget in analysis.project_budgets.values()
    ]
    departments = [
        DepartmentBudgetOut(
            department_id=rollup.department_id,
            department_name=rollup.department_name,
            planned_budget=rollup.planned_budget,
            actual_spend=rollup.actual_spend,
            remaining=rollup.remaining,
            utilization_pct=_pct(rollup.utilization_pct),
            completion_pct=float(rollup.completion_pct),
        )
        for rollup in analysis.department_budgets.values()
    ]
    totals = analysis.budget_totals
    return BudgetAnalyticsOut(
        as_of=analysis.as_of,
        projects=projects,
        departments=departments,
        totals=BudgetTotalsOut(
            planned_budget=totals.planned_budget,
            actual_spend=totals.actual_spend,
            remaining=totals.remaining,
            utilization_pct=_pct(totals.utilization_pct),
        ),
    )


# --- Capacity --------------------------------------------------------------------------------------


def clip_allocations(
    allocations: Iterable[AllocationFact], window_from: date | None, window_to: date | None
) -> tuple[AllocationFact, ...]:
    """Cut each allocation to the window ``[window_from, window_to]`` and drop those outside it.

    Either end may be ``None`` (open). Both ends are inclusive, like allocation dates.
    """
    first_day = date.min if window_from is None else window_from
    last_day = date.max if window_to is None else window_to
    clipped = []
    for allocation in allocations:
        start = max(allocation.start_date, first_day)
        end = min(allocation.end_date, last_day)
        if start <= end:
            clipped.append(replace(allocation, start_date=start, end_date=end))
    return tuple(clipped)


def _conflict_allocation(
    allocation: AllocationFact, projects: Mapping[int, ProjectFact], deliverables: Mapping[int, DeliverableFact]
) -> ConflictAllocationOut:
    """Describe an allocation behind a conflict, with its project and deliverable names."""
    project = projects.get(allocation.project_id)
    deliverable = deliverables.get(allocation.deliverable_id) if allocation.deliverable_id is not None else None
    return ConflictAllocationOut(
        id=allocation.id,
        project_id=allocation.project_id,
        # A project created between the snapshot's queries is not in it yet; fall back to its id.
        project_name=project.name if project is not None else f"Project {allocation.project_id}",
        deliverable_id=allocation.deliverable_id,
        deliverable_title=deliverable.title if deliverable is not None else None,
        allocation_percentage=allocation.allocation_percentage,
        start_date=allocation.start_date,
        end_date=allocation.end_date,
    )


def _employee(
    employee: EmployeeCapacity,
    bottleneck_ids: frozenset[int],
    allocations: Mapping[int, AllocationFact],
    projects: Mapping[int, ProjectFact],
    deliverables: Mapping[int, DeliverableFact],
) -> EmployeeCapacityOut:
    """Shape one person's capacity, listing each conflict's allocations with their own dates."""
    return EmployeeCapacityOut(
        user_id=employee.user_id,
        user_name=employee.user_name,
        department_id=employee.department_id,
        peak_load=employee.peak_load,
        current_load=employee.current_load,
        status=employee.status,
        segments=[
            SegmentOut(
                start_date=segment.start_date,
                end_date=segment.end_date,
                load=segment.load,
                allocation_ids=list(segment.allocation_ids),
            )
            for segment in employee.segments
        ],
        conflicts=[
            ConflictOut(
                start_date=conflict.start_date,
                end_date=conflict.end_date,
                load=conflict.load,
                allocations=[
                    _conflict_allocation(allocations[allocation_id], projects, deliverables)
                    for allocation_id in conflict.allocation_ids
                ],
            )
            for conflict in employee.conflicts
        ],
        is_compound_bottleneck=bool(bottleneck_ids),
        bottleneck_deliverables=[
            BottleneckDeliverableOut(
                id=deliverable_id,
                title=deliverables[deliverable_id].title,
                project_id=deliverables[deliverable_id].project_id,
            )
            for deliverable_id in sorted(bottleneck_ids)
        ],
    )


def capacity_overview(
    analysis: PortfolioAnalysis,
    *,
    department_id: int | None = None,
    window_from: date | None = None,
    window_to: date | None = None,
) -> CapacityOut:
    """Return every allocated person's load, ordered by name, optionally filtered.

    ``department_id`` keeps the people in that department. ``window_from`` and
    ``window_to`` (inclusive, either may be left open) restrict the timeline to
    that window: allocations are cut to it, people with no allocation inside it
    are left out, and every figure (segments, conflicts, peak load, load on
    ``as_of``, status and the compound-bottleneck flag) is computed over the
    window only, with the same engine rules. A conflict's allocations keep their
    full dates. ``over_allocated_count`` counts the people returned whose status
    is OVER_ALLOCATED.
    """
    snapshot = analysis.snapshot
    if window_from is None and window_to is None:
        capacity, bottlenecks = analysis.capacity, analysis.bottlenecks
    else:
        capacity = analyze_capacity(clip_allocations(snapshot.allocations, window_from, window_to), analysis.as_of)
        # Being allocated to a flagged deliverable does not depend on dates, so every allocation
        # counts for that link; only the conflict itself has to fall inside the window.
        bottlenecks = compound_bottlenecks(
            capacity, snapshot.deliverables, snapshot.allocations, analysis.dependencies, analysis.as_of
        )

    allocations = {allocation.id: allocation for allocation in snapshot.allocations}
    projects = {project.id: project for project in snapshot.projects}
    deliverables = {deliverable.id: deliverable for deliverable in snapshot.deliverables}
    employees = [
        _employee(employee, bottlenecks.get(employee.user_id, frozenset()), allocations, projects, deliverables)
        for employee in capacity.values()
        if department_id is None or employee.department_id == department_id
    ]
    return CapacityOut(
        as_of=analysis.as_of,
        employees=employees,
        over_allocated_count=sum(1 for employee in employees if employee.status == OVER_ALLOCATED),
    )


# --- Dashboard -------------------------------------------------------------------------------------


def dashboard(analysis: PortfolioAnalysis, events: Iterable[AuditLog]) -> DashboardOut:
    """Return the executive dashboard: counts, budget totals, top risks and the given audit events.

    Every project status and every risk level is present in the counts, with 0
    where nothing matches. ``top_risks`` lists up to ``TOP_RISKS_LIMIT`` projects
    that score above 0, highest first. The caller decides which ``events`` the
    role may see.
    """
    snapshot = analysis.snapshot
    statuses = Counter(project.status for project in snapshot.projects)
    levels = Counter(risk.risk_level for risk in analysis.risks.values())
    totals = analysis.budget_totals
    top_risks = [risk for risk in analysis.ranked_risks() if risk.risk_score > 0][:TOP_RISKS_LIMIT]
    return DashboardOut(
        as_of=analysis.as_of,
        total_projects=len(snapshot.projects),
        projects_by_status={status: statuses.get(status, 0) for status in PROJECT_STATUSES},
        risk_by_level={level: levels.get(level, 0) for level in RISK_LEVEL_ORDER},
        budget=BudgetSummaryOut(
            planned_total=totals.planned_budget,
            spent_total=totals.actual_spend,
            remaining_total=totals.remaining,
            utilization_pct=_pct(totals.utilization_pct),
        ),
        departments=[
            DepartmentSpendOut(
                department_id=rollup.department_id,
                department_name=rollup.department_name,
                planned_budget=rollup.planned_budget,
                actual_spend=rollup.actual_spend,
            )
            for rollup in analysis.department_budgets.values()
        ],
        over_allocated_count=analysis.over_allocated_count,
        top_risks=[
            TopRiskOut(
                project_id=risk.project_id,
                project_name=risk.project_name,
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                headline=risk.headline,
            )
            for risk in top_risks
        ],
        recent_activity=[AuditLogOut.model_validate(event) for event in events],
    )
