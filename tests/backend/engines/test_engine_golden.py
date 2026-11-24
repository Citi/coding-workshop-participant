"""Golden results of spec section 10, computed purely from dataclasses (no database).

The seed portfolio is built as engine facts for a fixed seed day ``T``. The
golden table must hold on the seed day and on the following day (the spec
places no offset within a day of a rule boundary). The database-seeded
counterpart is ``test_engine_golden_seed.py``; both share ``GOLDEN``.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from engine_factories import GOLDEN, T, day, golden_row, project_ids_by_name, spans

from app.engines.capacity import AVAILABLE, OVER_ALLOCATED
from app.engines.dependency import find_cycle_path, topological_levels
from app.engines.risk import analyze_portfolio
from app.engines.types import (
    AllocationFact,
    DeliverableFact,
    DependencyEdge,
    PortfolioAnalysis,
    PortfolioSnapshot,
    ProjectFact,
)

ALPHA, BETA, GAMMA, DELTA, EPSILON = 1, 2, 3, 4, 5

DEPARTMENTS = {1: "Engineering", 2: "Marketing", 3: "Finance", 4: "Operations", 5: "Human Resources"}

# user id: (name, department id)
USERS = {
    1: ("Asha Rao", 1),
    2: ("Vikram Shah", 1),
    3: ("Rohan Das", 1),
    4: ("Neha Kapoor", 3),
    5: ("Priya Nair", 1),
    6: ("Arjun Mehta", 1),
    7: ("Meera Iyer", 2),
    8: ("Kabir Sethi", 3),
    9: ("Sana Khan", 4),
    10: ("Divya Menon", 5),
}
PRIYA, ARJUN = 5, 6

# project id: (name, department id, PM user id, status, start offset, end offset, planned budget)
PROJECTS = {
    ALPHA: ("Project Alpha: Customer Payments Platform", 1, 2, "ACTIVE", -60, 25, "400000.00"),
    BETA: ("Project Beta: Brand Relaunch Campaign", 2, 7, "ACTIVE", -45, 50, "150000.00"),
    GAMMA: ("Project Gamma: Ledger Automation", 3, 8, "ACTIVE", -40, 90, "250000.00"),
    DELTA: ("Project Delta: Warehouse Tracking Rollout", 4, 9, "ACTIVE", -70, 20, "200000.00"),
    EPSILON: ("Project Epsilon: Onboarding Portal", 5, 10, "COMPLETED", -120, -10, "80000.00"),
}

# project id: budget entry amounts (spec: "Budget entries")
BUDGET_ENTRIES = {
    ALPHA: (180000, 60000, 35000, 20000, 5000),
    BETA: (60000, 35000, 10000),
    GAMMA: (90000, 40000, 7500),
    DELTA: (110000, 70000, 30000),
    EPSILON: (50000, 26000),
}

# deliverable id: (project, title, status, %, due offset, assignee, depends on)
DELIVERABLES = {
    1: (ALPHA, "Requirements Sign-off", "DONE", 100, -30, 2, None),
    2: (ALPHA, "API Schema", "BLOCKED", 40, -5, 5, 1),
    3: (ALPHA, "Payments Service Integration", "IN_PROGRESS", 20, 10, 6, 2),
    4: (ALPHA, "Mobile Client Integration", "NOT_STARTED", 0, 14, 3, 2),
    5: (ALPHA, "End-to-End Testing", "NOT_STARTED", 0, 22, 3, 3),
    6: (ALPHA, "Data Migration Plan", "IN_PROGRESS", 50, -3, 3, None),
    7: (BETA, "Brand Guidelines", "DONE", 100, -20, 7, None),
    8: (BETA, "Campaign Creative", "IN_PROGRESS", 60, -4, 7, 7),
    9: (BETA, "Website Refresh", "IN_PROGRESS", 40, 20, 7, 8),
    10: (BETA, "Launch Event", "NOT_STARTED", 0, 35, 7, 8),
    11: (GAMMA, "Chart of Accounts Mapping", "DONE", 100, -15, 8, None),
    12: (GAMMA, "Reconciliation Rules Engine", "IN_PROGRESS", 70, 25, 8, 11),
    13: (GAMMA, "Bank Feed Integration", "IN_PROGRESS", 50, 45, 6, 12),
    14: (GAMMA, "Month-End Close Pilot", "IN_PROGRESS", 20, 70, 8, 13),
    15: (DELTA, "Site Survey", "DONE", 100, -25, 9, None),
    16: (DELTA, "Scanner Procurement", "BLOCKED", 30, -7, 9, 15),
    17: (DELTA, "Warehouse Staff Training", "IN_PROGRESS", 60, -2, 9, None),
    18: (DELTA, "Pilot Go-Live", "IN_PROGRESS", 30, 15, 9, 16),
    19: (EPSILON, "Portal Design", "DONE", 100, -80, 10, None),
    20: (EPSILON, "Portal Build", "DONE", 100, -40, 10, 19),
    21: (EPSILON, "Rollout", "DONE", 100, -12, 10, 20),
}
BLOCKED_REASONS = {2: "Awaiting security approval of the partner data contract", 16: "Vendor delivery delayed"}
API_SCHEMA, PAYMENTS, MOBILE, END_TO_END = 2, 3, 4, 5

# allocation id: (user, project, deliverable, %, from offset, to offset)
ALLOCATIONS = {
    1: (PRIYA, ALPHA, 2, 60, -10, 20),  # half of the conflict
    2: (PRIYA, BETA, None, 60, -2, 12),  # other half: 120% from T-2 to T+12
    3: (PRIYA, GAMMA, None, 50, 40, 70),  # later, no overlap: must not be flagged
    4: (ARJUN, ALPHA, 3, 60, -20, 9),  # back-to-back control
    5: (ARJUN, GAMMA, 13, 60, 10, 40),  # peak stays 60%: no false positive
    6: (3, ALPHA, None, 80, -30, 25),
    7: (9, DELTA, None, 70, -30, 20),
    8: (8, GAMMA, None, 50, -40, 90),
}


def golden_snapshot(seed_day: date = T) -> PortfolioSnapshot:
    """Build the spec section 10 seed portfolio as engine facts for ``seed_day``."""

    def at(offset: int) -> date:
        return seed_day + timedelta(days=offset)

    projects = tuple(
        ProjectFact(
            id=pid,
            name=name,
            description=None,
            department_id=dept,
            department_name=DEPARTMENTS[dept],
            project_manager_id=pm,
            project_manager_name=USERS[pm][0],
            status=status,
            start_date=at(start),
            end_date=at(end),
            planned_budget=Decimal(planned),
        )
        for pid, (name, dept, pm, status, start, end, planned) in PROJECTS.items()
    )
    deliverables = tuple(
        DeliverableFact(
            id=did,
            project_id=pid,
            title=title,
            status=status,
            completion_percentage=pct,
            start_date=None,
            due_date=at(due),
            assigned_user_id=assignee,
            assigned_user_name=USERS[assignee][0],
            blocked_reason=BLOCKED_REASONS.get(did),
        )
        for did, (pid, title, status, pct, due, assignee, _) in DELIVERABLES.items()
    )
    edges = tuple(
        DependencyEdge(id=index, predecessor_id=predecessor, successor_id=did)
        for index, (did, predecessor) in enumerate(
            ((did, row[6]) for did, row in DELIVERABLES.items() if row[6] is not None), start=1
        )
    )
    allocations = tuple(
        AllocationFact(
            id=aid,
            user_id=user,
            user_name=USERS[user][0],
            user_department_id=USERS[user][1],
            project_id=pid,
            deliverable_id=did,
            allocation_percentage=pct,
            start_date=at(start),
            end_date=at(end),
        )
        for aid, (user, pid, did, pct, start, end) in ALLOCATIONS.items()
    )
    spend = {pid: sum((Decimal(amount) for amount in amounts), Decimal("0")) for pid, amounts in BUDGET_ENTRIES.items()}
    return PortfolioSnapshot(projects, deliverables, edges, allocations, spend)


@pytest.fixture(scope="module", params=[0, 1], ids=["as_of_seed_day", "as_of_next_day"])
def analysis(request: pytest.FixtureRequest) -> PortfolioAnalysis:
    """Analyse the portfolio seeded on T, as of T and as of T+1."""
    return analyze_portfolio(golden_snapshot(T), day(request.param))


@pytest.fixture(scope="module")
def analysis_on_seed_day() -> PortfolioAnalysis:
    """Analyse the portfolio as of the seed day, for exact evidence text."""
    return analyze_portfolio(golden_snapshot(T), T)


@pytest.mark.parametrize("project_name", list(GOLDEN), ids=["Alpha", "Beta", "Gamma", "Delta", "Epsilon"])
def test_golden_row(analysis: PortfolioAnalysis, project_name: str) -> None:
    """Every factor, the score, the level, completion and utilization match the golden table."""
    project_id = project_ids_by_name(analysis.snapshot)[project_name]
    assert golden_row(analysis, project_id) == GOLDEN[project_name]


def test_alpha_impacted_set(analysis: PortfolioAnalysis) -> None:
    """Alpha's impacted set is exactly Payments, Mobile and End-to-End Testing, caused by API Schema."""
    impacted = analysis.risks[ALPHA].impacted_deliverables
    assert [(item.id, item.title, item.depth, item.caused_by_title) for item in impacted] == [
        (PAYMENTS, "Payments Service Integration", 1, "API Schema"),
        (MOBILE, "Mobile Client Integration", 1, "API Schema"),
        (END_TO_END, "End-to-End Testing", 2, "API Schema"),
    ]
    assert analysis.dependencies.root_cause_ids == (2, 6, 8, 16, 17)


def test_priya_segments_and_peak(analysis: PortfolioAnalysis) -> None:
    """Priya: 60% (T-10..T-3), 120% (T-2..T+12), 60% (T+13..T+20), 50% (T+40..T+70); peak 120."""
    priya = analysis.capacity[PRIYA]
    assert spans(priya.segments) == [
        (-10, -3, 60, (1,)),
        (-2, 12, 120, (1, 2)),
        (13, 20, 60, (1,)),
        (40, 70, 50, (3,)),
    ]
    assert (priya.peak_load, priya.status) == (120, OVER_ALLOCATED)
    assert spans(priya.conflicts) == [(-2, 12, 120, (1, 2))]


def test_arjun_peaks_at_60_without_conflicts(analysis: PortfolioAnalysis) -> None:
    """Arjun's back-to-back allocations never overlap."""
    arjun = analysis.capacity[ARJUN]
    assert (arjun.peak_load, arjun.conflicts, arjun.status) == (60, (), AVAILABLE)
    assert spans(arjun.segments) == [(-20, 9, 60, (4,)), (10, 40, 60, (5,))]


def test_priya_is_the_only_compound_bottleneck(analysis: PortfolioAnalysis) -> None:
    """Over-allocated and owner of the blocked API Schema; Arjun is not over-allocated."""
    assert analysis.bottlenecks == {PRIYA: frozenset({API_SCHEMA})}
    assert analysis.over_allocated_count == 1


def test_ranking(analysis: PortfolioAnalysis) -> None:
    """Highest score first; ties by project name."""
    assert [risk.project_id for risk in analysis.ranked_risks()] == [ALPHA, DELTA, BETA, EPSILON, GAMMA]


def test_cycle_path_for_end_to_end_testing_to_api_schema() -> None:
    """Adding End-to-End Testing -> API Schema is rejected with the path spelled out."""
    snapshot = golden_snapshot()
    path = find_cycle_path(snapshot.dependencies, END_TO_END, API_SCHEMA)
    assert path == [API_SCHEMA, PAYMENTS, END_TO_END, API_SCHEMA]
    titles = {item.id: item.title for item in snapshot.deliverables}
    assert " → ".join(titles[item] for item in path) == (
        "API Schema → Payments Service Integration → End-to-End Testing → API Schema"
    )
    assert find_cycle_path(snapshot.dependencies, API_SCHEMA, END_TO_END) is None


def test_alpha_chain_levels() -> None:
    """Alpha's dependency chain drawn in columns."""
    levels = topological_levels(range(1, 7), golden_snapshot().dependencies)
    assert levels == {1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 0}


def test_alpha_explanation_on_the_seed_day(analysis_on_seed_day: PortfolioAnalysis) -> None:
    """Alpha's evidence and actions read like the spec 9.4 examples, built from the same numbers."""
    risk = analysis_on_seed_day.risks[ALPHA]
    assert risk.factor("schedule").detail == "2 overdue deliverables"
    assert risk.evidence == (
        "2 deliverables are overdue: 'API Schema' (due 2026-11-20, 5 days late) and "
        "'Data Migration Plan' (due 2026-11-22, 3 days late).",
        "'API Schema' (blocked, 5 days overdue) puts 3 downstream deliverables in this project at risk: "
        "'Payments Service Integration' (depth 1), 'Mobile Client Integration' (depth 1) and "
        "'End-to-End Testing' (depth 2).",
        "75.0% of the planned budget is consumed while deliverables are 35.0% complete.",
        "Priya Nair is at 120% concurrent allocation from 2026-11-23 to 2026-12-07.",
        "Priya Nair is a compound bottleneck on this project: over-allocated while responsible for "
        "'API Schema' (blocked, 5 days overdue).",
        "Deliverable 'API Schema' is BLOCKED and holds up 3 downstream deliverables.",
        "The project ends on 2026-12-20, 25 days from now, with deliverables 35.0% complete.",
    )
    assert risk.recommended_actions == (
        "Re-plan the 2 overdue deliverables: 'API Schema' (5 days late) and 'Data Migration Plan' (3 days late).",
        "Protect downstream work: 'Payments Service Integration', 'Mobile Client Integration' and "
        "'End-to-End Testing'.",
        "Freeze discretionary spend and re-baseline: 75.0% spent at 35.0% complete.",
        "Rebalance Priya Nair: remove at least 20 points between 2026-11-23 and 2026-12-07, or reassign 'API Schema'.",
        "Escalate the blocker on 'API Schema' (owner: Priya Nair); it holds up 3 downstream deliverables. "
        "Blocked reason: Awaiting security approval of the partner data contract.",
        "Review scope or end date: 25 days left at 35.0% complete.",
    )


def test_other_explanations_on_the_seed_day(analysis_on_seed_day: PortfolioAnalysis) -> None:
    """Beta names Priya's allocation, Delta explains its overrun, and Gamma and Epsilon say why they score 0."""
    risks = analysis_on_seed_day.risks
    assert (
        "Rebalance Priya Nair: remove at least 20 points between 2026-11-23 and 2026-12-07, "
        "or reassign their 60% allocation on this project."
    ) in risks[BETA].recommended_actions
    assert risks[DELTA].headline == "105.0% of the planned budget is consumed while deliverables are 55.0% complete."
    assert "Actual spend of 210,000.00 exceeds the planned budget of 200,000.00 by 10,000.00." in risks[DELTA].evidence
    assert (
        "Escalate the blocker on 'Scanner Procurement' (owner: Sana Khan); it holds up 1 downstream deliverable. "
        "Blocked reason: Vendor delivery delayed."
    ) in risks[DELTA].recommended_actions
    assert risks[GAMMA].evidence == ("No risk rule is triggered as of 2026-11-25.",)
    assert risks[EPSILON].evidence == ("Project is COMPLETED, so its delivery risk is not scored.",)


def test_budget_rollups_on_the_seed_day(analysis_on_seed_day: PortfolioAnalysis) -> None:
    """Department rollups and portfolio totals from the seed spend."""
    engineering = analysis_on_seed_day.department_budgets[1]
    assert (engineering.planned_budget, engineering.actual_spend, engineering.utilization_pct) == (
        Decimal("400000.00"),
        Decimal("300000.00"),
        Decimal("75.0"),
    )
    assert [rollup.department_name for rollup in analysis_on_seed_day.department_budgets.values()] == [
        "Engineering",
        "Finance",
        "Human Resources",
        "Marketing",
        "Operations",
    ]
    totals = analysis_on_seed_day.budget_totals
    assert (totals.planned_budget, totals.actual_spend, totals.remaining, totals.utilization_pct) == (
        Decimal("1080000.00"),
        Decimal("828500.00"),
        Decimal("251500.00"),
        Decimal("76.7"),
    )
