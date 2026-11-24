"""Risk engine: an explainable 0-100 delivery-risk score per project (spec section 9.4).

Six factors are scored from the portfolio facts, each capped at its maximum,
and summed into the score. Every non-zero factor also yields evidence lines and
recommended actions built from the same numbers as its points, so a score can
always be traced back to database facts. Every weight, cap and threshold lives
in the constants block at the top of this module.

``analyze_portfolio`` runs every engine once over a snapshot; it is the entry
point for the API layer.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import TypeVar

from app.engines.budget import budget_totals, completion_mean, department_rollups, project_budget
from app.engines.capacity import FULL_LOAD, analyze_capacity, compound_bottlenecks, current_conflicts
from app.engines.dependency import analyze_dependencies, is_overdue
from app.engines.types import (
    BLOCKED,
    DONE,
    AllocationFact,
    DeliverableFact,
    DependencyAnalysis,
    EmployeeCapacity,
    ImpactedItem,
    PortfolioAnalysis,
    PortfolioSnapshot,
    ProjectBudget,
    ProjectFact,
    RiskAssessment,
    RiskFactor,
    Segment,
)

__all__ = [
    "RISK_FACTORS",
    "RISK_LEVELS",
    "RISK_WEIGHTS",
    "SCORED_STATUSES",
    "PortfolioAnalysis",
    "RiskAssessment",
    "RiskFactor",
    "RiskWeights",
    "analyze_portfolio",
    "risk_level",
]

# ---------------------------------------------------------------------------
# Risk model constants (spec section 9.4): every weight, cap and threshold.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RiskWeights:
    """Points, caps and thresholds of the risk model. The six caps add up to 100."""

    # Schedule: points per overdue open deliverable.
    schedule_points_per_overdue: int = 8
    schedule_max: int = 20
    # Blocked: points for the first blocked deliverable, then for each further one.
    blocked_points_first: int = 10
    blocked_points_each_further: int = 5
    blocked_max: int = 15
    # Dependency blast radius: points per impacted deliverable of the project.
    blast_points_per_impacted: int = 5
    blast_max: int = 20
    # Resource: points per person in a current conflict, plus a compound-bottleneck bonus.
    resource_points_per_person: int = 8
    resource_points_bottleneck: int = 4
    resource_max: int = 15
    # Budget vs progress: overrun when spend is above 100% of plan (compared exactly, not rounded),
    # else points per pp by which rounded utilization runs ahead of rounded completion, above 10.
    budget_overrun_above_pct: Decimal = Decimal("100")
    budget_overrun_points: int = 20
    budget_divergence_above_pp: Decimal = Decimal("10")
    budget_points_per_pp: Decimal = Decimal("0.5")
    budget_max: int = 20
    # Deadline proximity: passed and incomplete (exact mean completion below 100%), within 30 days
    # below 70%, within 60 days below 50% (both on the rounded completion).
    deadline_passed_below_pct: Decimal = Decimal("100")
    deadline_passed_points: int = 10
    deadline_near_days: int = 30
    deadline_near_below_pct: Decimal = Decimal("70")
    deadline_near_points: int = 10
    deadline_soon_days: int = 60
    deadline_soon_below_pct: Decimal = Decimal("50")
    deadline_soon_points: int = 5
    deadline_max: int = 10


#: The weights in force.
RISK_WEIGHTS = RiskWeights()

#: Project statuses that are scored; COMPLETED and CANCELLED projects always score 0 (LOW).
SCORED_STATUSES = frozenset({"PLANNED", "ACTIVE", "ON_HOLD"})

#: Lowest score of each level, highest level first: 0-24 LOW, 25-49 MEDIUM, 50-74 HIGH, 75-100 CRITICAL.
RISK_LEVELS: tuple[tuple[int, str], ...] = ((75, "CRITICAL"), (50, "HIGH"), (25, "MEDIUM"), (0, "LOW"))

#: Factor key, label and maximum points, in display order.
RISK_FACTORS: tuple[tuple[str, str, int], ...] = (
    ("schedule", "Schedule", RISK_WEIGHTS.schedule_max),
    ("blocked", "Blocked deliverables", RISK_WEIGHTS.blocked_max),
    ("blast_radius", "Dependency blast radius", RISK_WEIGHTS.blast_max),
    ("resource", "Resource over-allocation", RISK_WEIGHTS.resource_max),
    ("budget", "Budget vs progress", RISK_WEIGHTS.budget_max),
    ("deadline", "Deadline proximity", RISK_WEIGHTS.deadline_max),
)

# ---------------------------------------------------------------------------
# Internal structures
# ---------------------------------------------------------------------------

_FactT = TypeVar("_FactT", DeliverableFact, AllocationFact)


@dataclass(frozen=True)
class _Scored:
    """One factor's points plus the summary, evidence and actions built from the same numbers."""

    points: int
    detail: str
    evidence: tuple[str, ...] = ()
    actions: tuple[str, ...] = ()


@dataclass(frozen=True)
class _Window:
    """Back-to-back conflict segments of one person, reported as one window."""

    start_date: date
    end_date: date
    segments: tuple[Segment, ...]

    @property
    def peak_load(self) -> int:
        """Return the highest load in the window."""
        return max(segment.load for segment in self.segments)

    @property
    def uniform(self) -> bool:
        """Return True when the load is the same across the whole window."""
        return len({segment.load for segment in self.segments}) == 1


@dataclass(frozen=True)
class _Portfolio:
    """Lookups over one snapshot, shared by every project's assessment."""

    as_of: date
    projects: Mapping[int, ProjectFact]
    deliverables: Mapping[int, DeliverableFact]
    deliverables_by_project: Mapping[int, tuple[DeliverableFact, ...]]
    allocations_by_project: Mapping[int, tuple[AllocationFact, ...]]
    dependencies: DependencyAnalysis
    capacity: Mapping[int, EmployeeCapacity]
    bottlenecks: Mapping[int, frozenset[int]]


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------


def _plural(count: int, singular: str, plural: str | None = None) -> str:
    """Return '1 deliverable', '3 deliverables' or 'no deliverables'."""
    word = singular if count == 1 else (plural or f"{singular}s")
    return f"{count} {word}" if count else f"no {word}"


def _days(count: int) -> str:
    """Return '1 day' or 'N days'."""
    return "1 day" if count == 1 else f"{count} days"


def _join(items: Sequence[str], conjunction: str = "and") -> str:
    """Join items as 'a', 'a and b' or 'a, b and c'."""
    if len(items) < 2:
        return "".join(items)
    return f"{', '.join(items[:-1])} {conjunction} {items[-1]}"


def _quote(title: str) -> str:
    """Quote a deliverable title the way the spec examples do: 'API Schema'."""
    return f"'{title}'"


def _capitalize(text: str) -> str:
    """Upper-case the first character only."""
    return text[:1].upper() + text[1:]


def _sentence(text: str) -> str:
    """Trim free text and make sure it ends with a full stop."""
    text = text.strip()
    return text if text.endswith((".", "!", "?")) else f"{text}."


def _money_text(value: Decimal) -> str:
    """Format an amount with thousands separators and two decimals: 210,000.00."""
    return f"{value:,.2f}"


def _round_half_up(value: Decimal) -> int:
    """Round to a whole number, half up: 0.5 -> 1, 2.5 -> 3."""
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _root_state(deliverable: DeliverableFact, as_of: date) -> str:
    """Say why a root cause is one: 'blocked', '5 days overdue' or 'blocked, 5 days overdue'."""
    parts = []
    if deliverable.status == BLOCKED:
        parts.append("blocked")
    if deliverable.due_date < as_of:
        parts.append(f"{_days((as_of - deliverable.due_date).days)} overdue")
    return ", ".join(parts)


def _issue_state(deliverable_id: int, portfolio: _Portfolio) -> str:
    """Describe a root-cause or impacted deliverable for the compound-bottleneck evidence."""
    impacted = portfolio.dependencies.impacted.get(deliverable_id)
    if impacted is not None:
        return f"downstream of {_quote(impacted.caused_by_title)}"
    return _root_state(portfolio.deliverables[deliverable_id], portfolio.as_of)


# ---------------------------------------------------------------------------
# Factors
# ---------------------------------------------------------------------------


def _schedule(deliverables: Sequence[DeliverableFact], as_of: date) -> _Scored:
    """Schedule: 8 points per overdue open deliverable, capped at 20."""
    weights = RISK_WEIGHTS
    overdue = sorted(
        (item for item in deliverables if is_overdue(item, as_of)), key=lambda item: (item.due_date, item.id)
    )
    count = len(overdue)
    points = min(weights.schedule_max, weights.schedule_points_per_overdue * count)
    detail = _capitalize(_plural(count, "overdue deliverable"))
    if not count:
        return _Scored(points, detail)
    late = [_days((as_of - item.due_date).days) for item in overdue]
    facts = [
        f"{_quote(item.title)} (due {item.due_date.isoformat()}, {days} late)" for item, days in zip(overdue, late)
    ]
    replan = [f"{_quote(item.title)} ({days} late)" for item, days in zip(overdue, late)]
    verb = "is" if count == 1 else "are"
    evidence = f"{_plural(count, 'deliverable')} {verb} overdue: {_join(facts)}."
    action = f"Re-plan the {_plural(count, 'overdue deliverable')}: {_join(replan)}."
    return _Scored(points, detail, (evidence,), (action,))


def _blocked(deliverables: Sequence[DeliverableFact], portfolio: _Portfolio) -> _Scored:
    """Blocked: 10 points for the first blocked deliverable and 5 for each further one, capped at 15."""
    weights = RISK_WEIGHTS
    blocked = sorted((item for item in deliverables if item.status == BLOCKED), key=lambda item: item.id)
    count = len(blocked)
    points = 0
    if count:
        points = min(
            weights.blocked_max, weights.blocked_points_first + weights.blocked_points_each_further * (count - 1)
        )
    evidence: list[str] = []
    actions: list[str] = []
    for item in blocked:
        held = _plural(len(portfolio.dependencies.held_up_by_root.get(item.id, ())), "downstream deliverable")
        evidence.append(f"Deliverable {_quote(item.title)} is BLOCKED and holds up {held}.")
        owner = item.assigned_user_name or "unassigned"
        if item.blocked_reason and item.blocked_reason.strip():
            reason = f"Blocked reason: {_sentence(item.blocked_reason)}"
        else:
            reason = "No blocked reason is recorded."
        actions.append(f"Escalate the blocker on {_quote(item.title)} (owner: {owner}); it holds up {held}. {reason}")
    return _Scored(points, _capitalize(_plural(count, "blocked deliverable")), tuple(evidence), tuple(actions))


def _blast_radius(project: ProjectFact, portfolio: _Portfolio) -> tuple[_Scored, tuple[ImpactedItem, ...]]:
    """Blast radius: 5 points per impacted deliverable of this project, capped at 20.

    The root causes may sit in any project. Returns the factor and this
    project's impacted deliverables, ordered by depth, then id.
    """
    weights = RISK_WEIGHTS
    impacted = tuple(item for item in portfolio.dependencies.impacted.values() if item.project_id == project.id)
    count = len(impacted)
    points = min(weights.blast_max, weights.blast_points_per_impacted * count)
    detail = _capitalize(_plural(count, "impacted deliverable"))
    if not count:
        return _Scored(points, detail), impacted

    by_cause: dict[int, list[ImpactedItem]] = {}
    for item in impacted:
        by_cause.setdefault(item.caused_by_id, []).append(item)
    evidence = []
    for cause_id, items in by_cause.items():
        cause = portfolio.deliverables[cause_id]
        other = portfolio.projects.get(cause.project_id)
        where = f" in {other.name}" if other is not None and other.id != project.id else ""
        listed = _join([f"{_quote(item.title)} (depth {item.depth})" for item in items])
        evidence.append(
            f"{_quote(cause.title)}{where} ({_root_state(cause, portfolio.as_of)}) puts "
            f"{_plural(len(items), 'downstream deliverable')} in this project at risk: {listed}."
        )
    action = f"Protect downstream work: {_join([_quote(item.title) for item in impacted])}."
    return _Scored(points, detail, tuple(evidence), (action,)), impacted


def _merge_windows(segments: Sequence[Segment]) -> list[_Window]:
    """Merge back-to-back segments (sorted by start date) into windows."""
    windows: list[_Window] = []
    for segment in segments:
        if windows and (segment.start_date - windows[-1].end_date).days == 1:
            last = windows[-1]
            windows[-1] = _Window(last.start_date, segment.end_date, (*last.segments, segment))
        else:
            windows.append(_Window(segment.start_date, segment.end_date, (segment,)))
    return windows


def _reassign_target(
    user_id: int, window: _Window, project: ProjectFact, bottleneck_ids: Sequence[int], portfolio: _Portfolio
) -> str:
    """Name the open work on this project the person could hand over during a conflict window.

    Candidates are their compound-bottleneck deliverables, the deliverables of
    their allocations to this project in the window, and this project's
    deliverables assigned to them. Without any, name the allocation itself.
    """
    window_ids = {allocation_id for segment in window.segments for allocation_id in segment.allocation_ids}
    mine = [
        allocation
        for allocation in portfolio.allocations_by_project.get(project.id, ())
        if allocation.user_id == user_id and allocation.id in window_ids
    ]
    candidates = set(bottleneck_ids)
    candidates.update(allocation.deliverable_id for allocation in mine if allocation.deliverable_id is not None)
    candidates.update(
        item.id for item in portfolio.deliverables_by_project.get(project.id, ()) if item.assigned_user_id == user_id
    )
    titles = [
        _quote(portfolio.deliverables[deliverable_id].title)
        for deliverable_id in sorted(candidates)
        if deliverable_id in portfolio.deliverables
        and portfolio.deliverables[deliverable_id].project_id == project.id
        and portfolio.deliverables[deliverable_id].status != DONE
    ]
    if titles:
        return _join(titles, "or")
    share = max(
        sum(allocation.allocation_percentage for allocation in mine if allocation.id in segment.allocation_ids)
        for segment in window.segments
    )
    return f"their {share}% allocation on this project"


def _resource(project: ProjectFact, portfolio: _Portfolio) -> _Scored:
    """Resource: 8 points per person whose allocation here is in a current conflict, +4 if a bottleneck here.

    A conflict is current when it has not ended by ``as_of``. The bonus applies
    when the person is a compound bottleneck through a deliverable of this
    project. Capped at 15.
    """
    weights = RISK_WEIGHTS
    relevant: dict[int, set[Segment]] = {}
    for allocation in portfolio.allocations_by_project.get(project.id, ()):
        for conflict in current_conflicts(portfolio.capacity[allocation.user_id], portfolio.as_of):
            if allocation.id in conflict.allocation_ids:
                relevant.setdefault(allocation.user_id, set()).add(conflict)

    project_deliverable_ids = {item.id for item in portfolio.deliverables_by_project.get(project.id, ())}
    points = 0
    bottleneck_people = 0
    evidence: list[str] = []
    actions: list[str] = []
    for user_id in sorted(relevant, key=lambda uid: (portfolio.capacity[uid].user_name.lower(), uid)):
        name = portfolio.capacity[user_id].user_name
        windows = _merge_windows(sorted(relevant[user_id], key=lambda segment: segment.start_date))
        bottleneck_ids = sorted(portfolio.bottlenecks.get(user_id, frozenset()) & project_deliverable_ids)
        points += weights.resource_points_per_person
        for window in windows:
            load = f"{window.peak_load}%" if window.uniform else f"up to {window.peak_load}%"
            evidence.append(
                f"{name} is at {load} concurrent allocation from {window.start_date.isoformat()} "
                f"to {window.end_date.isoformat()}."
            )
        if bottleneck_ids:
            points += weights.resource_points_bottleneck
            bottleneck_people += 1
            listed = _join(
                [
                    f"{_quote(portfolio.deliverables[item_id].title)} ({_issue_state(item_id, portfolio)})"
                    for item_id in bottleneck_ids
                ]
            )
            evidence.append(
                f"{name} is a compound bottleneck on this project: over-allocated while responsible for {listed}."
            )
        for window in windows:
            target = _reassign_target(user_id, window, project, bottleneck_ids, portfolio)
            # A conflict window peaks above FULL_LOAD, so this is always at least "1 point".
            excess = _plural(window.peak_load - FULL_LOAD, "point")
            actions.append(
                f"Rebalance {name}: remove at least {excess} between "
                f"{window.start_date.isoformat()} and {window.end_date.isoformat()}, or reassign {target}."
            )
    detail = _capitalize(_plural(len(relevant), "over-allocated person", "over-allocated people"))
    if bottleneck_people:
        detail = f"{detail}, {_plural(bottleneck_people, 'compound bottleneck')}"
    return _Scored(min(weights.resource_max, points), detail, tuple(evidence), tuple(actions))


def _budget(budget: ProjectBudget) -> _Scored:
    """Budget: 20 points above 100% utilization, else 0.5 points per pp of divergence above 10, capped at 20.

    Over budget is decided on the exact amounts, so an overrun too small to move
    the rounded utilization (400,150.00 of 400,000.00 reads 100.0%) still scores
    20 and is explained in money. The divergence uses the rounded percentages
    that the evidence shows.
    """
    weights = RISK_WEIGHTS
    utilization, completion = budget.utilization_pct, budget.completion_pct
    if utilization is None:
        return _Scored(0, "No planned budget")
    # actual / planned * 100 > 100, without dividing or rounding (planned is above 0 here).
    over_budget = budget.actual_spend * 100 > budget.planned_budget * weights.budget_overrun_above_pct
    divergence = utilization - completion
    if over_budget:
        points = weights.budget_overrun_points
    elif divergence > weights.budget_divergence_above_pp:
        points = _round_half_up((divergence - weights.budget_divergence_above_pp) * weights.budget_points_per_pp)
    else:
        points = 0
    points = min(weights.budget_max, points)
    detail = f"{utilization}% spent at {completion}% complete" + (" (over budget)" if over_budget else "")
    if not points:
        return _Scored(points, detail)
    evidence = [f"{utilization}% of the planned budget is consumed while deliverables are {completion}% complete."]
    if over_budget:
        evidence.append(
            f"Actual spend of {_money_text(budget.actual_spend)} exceeds the planned budget of "
            f"{_money_text(budget.planned_budget)} by {_money_text(budget.actual_spend - budget.planned_budget)}."
        )
    action = f"Freeze discretionary spend and re-baseline: {utilization}% spent at {completion}% complete."
    return _Scored(points, detail, tuple(evidence), (action,))


def _deadline(
    project: ProjectFact, deliverables: Sequence[DeliverableFact], completion: Decimal, as_of: date
) -> _Scored:
    """Deadline: 10 if passed and incomplete, 10 within 30 days below 70%, 5 within 60 days below 50%.

    Incomplete is decided on the exact mean completion, so a project with one
    deliverable at 99% is still incomplete when its rounded completion reads
    100.0%; the text then says how many deliverables are below 100%. The 70% and
    50% thresholds use the rounded ``completion`` that the evidence shows.
    """
    weights = RISK_WEIGHTS
    days_left = (project.end_date - as_of).days
    incomplete = completion_mean(deliverables) < weights.deadline_passed_below_pct
    if days_left < 0 and incomplete:
        points = weights.deadline_passed_points
    elif days_left <= weights.deadline_near_days and completion < weights.deadline_near_below_pct:
        points = weights.deadline_near_points
    elif days_left <= weights.deadline_soon_days and completion < weights.deadline_soon_below_pct:
        points = weights.deadline_soon_points
    else:
        points = 0
    points = min(weights.deadline_max, points)

    end = project.end_date.isoformat()
    if days_left < 0:
        progress = f"{completion}% complete"
        if incomplete and completion >= weights.deadline_passed_below_pct:
            # Rounding shows 100.0% although work is open: say how much, so the points are explained.
            unfinished = sum(
                1 for item in deliverables if item.completion_percentage < weights.deadline_passed_below_pct
            )
            progress = f"{progress} ({_plural(unfinished, 'deliverable')} still below 100%)"
        detail = f"Ended {_days(-days_left)} ago at {progress}"
        evidence = f"The project end date {end} passed {_days(-days_left)} ago with deliverables {progress}."
        action = f"Review scope or end date: {_days(-days_left)} past the end date at {progress}."
    elif days_left == 0:
        detail = f"Ends today at {completion}% complete"
        evidence = f"The project ends today ({end}) with deliverables {completion}% complete."
        action = f"Review scope or end date: 0 days left at {completion}% complete."
    else:
        detail = f"{_days(days_left)} left at {completion}% complete"
        evidence = f"The project ends on {end}, {_days(days_left)} from now, with deliverables {completion}% complete."
        action = f"Review scope or end date: {_days(days_left)} left at {completion}% complete."
    if not points:
        return _Scored(points, detail)
    return _Scored(points, detail, (evidence,), (action,))


# ---------------------------------------------------------------------------
# Assessment
# ---------------------------------------------------------------------------


def risk_level(score: int) -> str:
    """Map a score to LOW (0-24), MEDIUM (25-49), HIGH (50-74) or CRITICAL (75-100)."""
    for minimum, level in RISK_LEVELS:
        if score >= minimum:
            return level
    return RISK_LEVELS[-1][1]


def _not_scored(project: ProjectFact, as_of: date) -> RiskAssessment:
    """A COMPLETED or CANCELLED project: score 0, LOW, one evidence line saying why, no actions."""
    reason = f"Not scored: project is {project.status}"
    return RiskAssessment(
        project_id=project.id,
        project_name=project.name,
        risk_score=0,
        risk_level=risk_level(0),
        as_of=as_of,
        factors=tuple(RiskFactor(key, label, 0, max_points, reason) for key, label, max_points in RISK_FACTORS),
        evidence=(f"Project is {project.status}, so its delivery risk is not scored.",),
        impacted_deliverables=(),
        recommended_actions=(),
    )


def _assess_project(project: ProjectFact, budget: ProjectBudget, portfolio: _Portfolio) -> RiskAssessment:
    """Score one project's six factors and order its evidence and actions by points, highest first."""
    if project.status not in SCORED_STATUSES:
        return _not_scored(project, portfolio.as_of)
    deliverables = portfolio.deliverables_by_project.get(project.id, ())
    blast_radius, impacted = _blast_radius(project, portfolio)
    scored = {
        "schedule": _schedule(deliverables, portfolio.as_of),
        "blocked": _blocked(deliverables, portfolio),
        "blast_radius": blast_radius,
        "resource": _resource(project, portfolio),
        "budget": _budget(budget),
        "deadline": _deadline(project, deliverables, budget.completion_pct, portfolio.as_of),
    }
    factors = tuple(
        RiskFactor(key=key, label=label, points=scored[key].points, max_points=max_points, detail=scored[key].detail)
        for key, label, max_points in RISK_FACTORS
    )
    score = sum(factor.points for factor in factors)
    # A stable sort keeps the display order between factors with equal points.
    ranked = [scored[factor.key] for factor in sorted(factors, key=lambda factor: -factor.points)]
    evidence = tuple(line for result in ranked for line in result.evidence)
    actions = tuple(line for result in ranked for line in result.actions)
    return RiskAssessment(
        project_id=project.id,
        project_name=project.name,
        risk_score=score,
        risk_level=risk_level(score),
        as_of=portfolio.as_of,
        factors=factors,
        evidence=evidence or (f"No risk rule is triggered as of {portfolio.as_of.isoformat()}.",),
        impacted_deliverables=impacted,
        recommended_actions=actions,
    )


def _group_by_project(items: Iterable[_FactT]) -> dict[int, tuple[_FactT, ...]]:
    """Group deliverables or allocations by ``project_id``, keeping their order."""
    groups: dict[int, list[_FactT]] = {}
    for item in items:
        groups.setdefault(item.project_id, []).append(item)
    return {project_id: tuple(group) for project_id, group in groups.items()}


def analyze_portfolio(snapshot: PortfolioSnapshot, as_of: date) -> PortfolioAnalysis:
    """Run every engine once over the snapshot: dependencies, capacity, budgets and risk.

    One call serves every analytics endpoint. ``risks`` holds an assessment for
    every project (COMPLETED and CANCELLED ones score 0), keyed by project id.
    """
    dependencies = analyze_dependencies(snapshot.deliverables, snapshot.dependencies, as_of)
    capacity = analyze_capacity(snapshot.allocations, as_of)
    bottlenecks = compound_bottlenecks(capacity, snapshot.deliverables, snapshot.allocations, dependencies, as_of)
    deliverables_by_project = _group_by_project(snapshot.deliverables)
    project_budgets = {
        project.id: project_budget(
            project,
            deliverables_by_project.get(project.id, ()),
            snapshot.spend_by_project.get(project.id, Decimal(0)),
        )
        for project in snapshot.projects
    }
    portfolio = _Portfolio(
        as_of=as_of,
        projects={project.id: project for project in snapshot.projects},
        deliverables={item.id: item for item in snapshot.deliverables},
        deliverables_by_project=deliverables_by_project,
        allocations_by_project=_group_by_project(snapshot.allocations),
        dependencies=dependencies,
        capacity=capacity,
        bottlenecks=bottlenecks,
    )
    risks = {
        project.id: _assess_project(project, project_budgets[project.id], portfolio) for project in snapshot.projects
    }
    return PortfolioAnalysis(
        as_of=as_of,
        snapshot=snapshot,
        dependencies=dependencies,
        capacity=capacity,
        bottlenecks=bottlenecks,
        project_budgets=project_budgets,
        department_budgets=department_rollups(project_budgets.values()),
        budget_totals=budget_totals(project_budgets.values()),
        risks=risks,
    )
