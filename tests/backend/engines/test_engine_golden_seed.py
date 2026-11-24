"""Golden seed (spec 13.1): seed the database on a fixed T, load it, and assert the spec section 10 results.

``test_engine_golden.py`` rebuilds the seed tables as dataclasses. This module
runs the real seed (``app.db.seed.seed_portfolio``) through the real loader
(``app.services.portfolio.load_snapshot``) into ``analyze_portfolio``, so a
seed or loader that drifts from the spec fails here. Expected values come from
the spec (``engine_factories.GOLDEN`` and the literals below), never from the
seed module. Everything is looked up by name, not by database id.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date

import pytest
from conftest import TEST_PASSWORD
from engine_factories import GOLDEN, T, day, golden_row, project_ids_by_name
from sqlalchemy.orm import Session

from app.db.seed import seed_portfolio
from app.engines.capacity import AVAILABLE, OVER_ALLOCATED
from app.engines.dependency import find_cycle_path
from app.engines.risk import analyze_portfolio
from app.engines.types import EmployeeCapacity, PortfolioAnalysis, PortfolioSnapshot, Segment
from app.services.portfolio import load_snapshot

ALPHA = "Project Alpha: Customer Payments Platform"
BETA = "Project Beta: Brand Relaunch Campaign"

# The golden results must hold on the seed day and on the day after (spec section 10).
AS_OF_SEED_DAY_AND_NEXT = pytest.mark.parametrize("as_of", [T, day(1)], ids=["as_of_seed_day", "as_of_next_day"])


@pytest.fixture
def seeded_snapshot(db_session: Session) -> PortfolioSnapshot:
    """Seed the spec section 10 portfolio on ``T``, commit it, and load it back with the portfolio loader."""
    seed_portfolio(db_session, TEST_PASSWORD, T)
    db_session.commit()
    return load_snapshot(db_session)


def employee(analysis: PortfolioAnalysis, name: str) -> EmployeeCapacity:
    """Return the capacity of the one person called ``name``."""
    (match,) = [item for item in analysis.capacity.values() if item.user_name == name]
    return match


def offsets(segments: Iterable[Segment]) -> list[tuple[int, int, int]]:
    """Describe segments as ``(start offset, end offset, load)``, with offsets in days from ``T``."""
    return [((segment.start_date - T).days, (segment.end_date - T).days, segment.load) for segment in segments]


@AS_OF_SEED_DAY_AND_NEXT
def test_every_golden_row(seeded_snapshot: PortfolioSnapshot, as_of: date) -> None:
    """All ten golden columns of every project match spec section 10; no project is missing or extra."""
    analysis = analyze_portfolio(seeded_snapshot, as_of)
    computed = {name: golden_row(analysis, pid) for name, pid in project_ids_by_name(seeded_snapshot).items()}
    assert computed == GOLDEN


@AS_OF_SEED_DAY_AND_NEXT
def test_alpha_impacted_set(seeded_snapshot: PortfolioSnapshot, as_of: date) -> None:
    """Alpha's impacted set is exactly Payments, Mobile and End-to-End Testing, all held up by API Schema."""
    analysis = analyze_portfolio(seeded_snapshot, as_of)
    alpha = analysis.risks[project_ids_by_name(seeded_snapshot)[ALPHA]]
    assert sorted((item.title, item.depth, item.caused_by_title) for item in alpha.impacted_deliverables) == [
        ("End-to-End Testing", 2, "API Schema"),
        ("Mobile Client Integration", 1, "API Schema"),
        ("Payments Service Integration", 1, "API Schema"),
    ]
    titles = {item.id: item.title for item in seeded_snapshot.deliverables}
    assert sorted(titles[root_id] for root_id in analysis.dependencies.root_cause_ids) == [
        "API Schema",
        "Campaign Creative",
        "Data Migration Plan",
        "Scanner Procurement",
        "Warehouse Staff Training",
    ]


@AS_OF_SEED_DAY_AND_NEXT
def test_priya_segments_peak_and_conflict(seeded_snapshot: PortfolioSnapshot, as_of: date) -> None:
    """Priya: 60% (T-10..T-3), 120% (T-2..T+12), 60% (T+13..T+20), 50% (T+40..T+70); peak 120."""
    analysis = analyze_portfolio(seeded_snapshot, as_of)
    priya = employee(analysis, "Priya Nair")
    assert offsets(priya.segments) == [(-10, -3, 60), (-2, 12, 120), (13, 20, 60), (40, 70, 50)]
    assert (priya.peak_load, priya.current_load, priya.status) == (120, 120, OVER_ALLOCATED)

    # The one conflict is her Alpha allocation on API Schema plus her project-level Beta allocation.
    (conflict,) = priya.conflicts
    assert offsets([conflict]) == [(-2, 12, 120)]
    project_names = {pid: name for name, pid in project_ids_by_name(seeded_snapshot).items()}
    titles = {item.id: item.title for item in seeded_snapshot.deliverables}
    allocations = {item.id: item for item in seeded_snapshot.allocations}
    contributing = [allocations[allocation_id] for allocation_id in conflict.allocation_ids]
    assert sorted(
        (project_names[item.project_id], titles.get(item.deliverable_id), item.allocation_percentage)
        for item in contributing
    ) == [(ALPHA, "API Schema", 60), (BETA, None, 60)]

    # She is the only over-allocated person and the only compound bottleneck (owner of the blocked API Schema).
    bottlenecks = {
        analysis.capacity[user_id].user_name: sorted(titles[item_id] for item_id in item_ids)
        for user_id, item_ids in analysis.bottlenecks.items()
    }
    assert (bottlenecks, analysis.over_allocated_count) == ({"Priya Nair": ["API Schema"]}, 1)


@AS_OF_SEED_DAY_AND_NEXT
def test_arjun_peaks_at_60_without_conflicts(seeded_snapshot: PortfolioSnapshot, as_of: date) -> None:
    """Arjun's back-to-back allocations (T-20..T+9, then T+10..T+40) never overlap."""
    arjun = employee(analyze_portfolio(seeded_snapshot, as_of), "Arjun Mehta")
    assert (arjun.peak_load, arjun.conflicts, arjun.status) == (60, (), AVAILABLE)
    assert offsets(arjun.segments) == [(-20, 9, 60), (10, 40, 60)]


def test_cycle_path_is_spelled_out_by_title(seeded_snapshot: PortfolioSnapshot) -> None:
    """Adding End-to-End Testing -> API Schema would close the loop named in spec section 10."""
    ids = {item.title: item.id for item in seeded_snapshot.deliverables}
    titles = {item.id: item.title for item in seeded_snapshot.deliverables}
    path = find_cycle_path(seeded_snapshot.dependencies, ids["End-to-End Testing"], ids["API Schema"])
    assert path is not None
    assert " → ".join(titles[node_id] for node_id in path) == (
        "API Schema → Payments Service Integration → End-to-End Testing → API Schema"
    )
    # The same edge the other way round is a forward shortcut, not a cycle.
    assert find_cycle_path(seeded_snapshot.dependencies, ids["API Schema"], ids["End-to-End Testing"]) is None
