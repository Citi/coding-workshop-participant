"""Capacity engine: sweep line, statuses and compound bottlenecks (spec 9.2)."""

from __future__ import annotations

from datetime import date

from engine_factories import T, day, make_allocation, make_deliverable, make_edge, spans

from app.engines.capacity import (
    AVAILABLE,
    FULLY_ALLOCATED,
    OVER_ALLOCATED,
    analyze_capacity,
    compound_bottlenecks,
    current_conflicts,
    sweep,
)
from app.engines.dependency import analyze_dependencies
from app.engines.types import AllocationFact, Segment


class TestSweep:
    """Segments start whenever the active set changes; end dates are inclusive."""

    def test_overlapping_windows(self) -> None:
        segments = sweep([make_allocation(1, pct=50, start=0, end=10), make_allocation(2, pct=60, start=5, end=15)])
        assert spans(segments) == [(0, 4, 50, (1,)), (5, 10, 110, (1, 2)), (11, 15, 60, (2,))]

    def test_back_to_back_windows_do_not_overlap(self) -> None:
        # Arjun's control case: same size, back to back, so the peak stays 60.
        segments = sweep([make_allocation(1, pct=60, start=-20, end=9), make_allocation(2, pct=60, start=10, end=40)])
        assert spans(segments) == [(-20, 9, 60, (1,)), (10, 40, 60, (2,))]

    def test_nested_window(self) -> None:
        segments = sweep([make_allocation(1, pct=50, start=0, end=30), make_allocation(2, pct=60, start=10, end=20)])
        assert spans(segments) == [(0, 9, 50, (1,)), (10, 20, 110, (1, 2)), (21, 30, 50, (1,))]

    def test_single_day_window(self) -> None:
        assert spans(sweep([make_allocation(1, pct=40, start=3, end=3)])) == [(3, 3, 40, (1,))]

    def test_end_date_is_inclusive(self) -> None:
        # The first allocation still counts on its end date: one shared day at 120%.
        segments = sweep([make_allocation(1, pct=60, start=0, end=5), make_allocation(2, pct=60, start=5, end=10)])
        assert spans(segments) == [(0, 4, 60, (1,)), (5, 5, 120, (1, 2)), (6, 10, 60, (2,))]

    def test_gaps_produce_no_zero_segment(self) -> None:
        segments = sweep([make_allocation(1, start=0, end=2), make_allocation(2, start=10, end=12)])
        assert spans(segments) == [(0, 2, 50, (1,)), (10, 12, 50, (2,))]

    def test_identical_windows_share_one_segment(self) -> None:
        segments = sweep([make_allocation(2, pct=30, start=0, end=4), make_allocation(1, pct=30, start=0, end=4)])
        assert spans(segments) == [(0, 4, 60, (1, 2))]

    def test_empty_and_invalid_ranges(self) -> None:
        assert sweep([]) == []
        assert sweep([make_allocation(1, start=5, end=4)]) == []

    def test_open_ended_allocation_runs_to_date_max(self) -> None:
        open_ended = AllocationFact(1, 1, "Open", 1, 1, None, 50, day(0), date.max)
        segments = sweep([open_ended, make_allocation(2, pct=60, start=5, end=6)])
        assert segments[-1] == Segment(day(7), date.max, 50, (1,))
        assert spans(segments[:2]) == [(0, 4, 50, (1,)), (5, 6, 110, (1, 2))]


class TestAnalyzeCapacity:
    """Peak, current load and status per person."""

    def test_priya_from_the_seed(self) -> None:
        who = {"user_id": 5, "user_name": "Priya Nair"}
        priya = [
            make_allocation(1, **who, project_id=1, deliverable_id=2, pct=60, start=-10, end=20),
            make_allocation(2, **who, project_id=2, pct=60, start=-2, end=12),
            make_allocation(3, **who, project_id=3, pct=50, start=40, end=70),
        ]
        employee = analyze_capacity(priya, T)[5]
        assert spans(employee.segments) == [
            (-10, -3, 60, (1,)),
            (-2, 12, 120, (1, 2)),
            (13, 20, 60, (1,)),
            (40, 70, 50, (3,)),
        ]
        assert spans(employee.conflicts) == [(-2, 12, 120, (1, 2))]
        assert (employee.peak_load, employee.current_load, employee.status) == (120, 120, OVER_ALLOCATED)
        assert (employee.user_name, employee.department_id) == ("Priya Nair", 1)

    def test_conflict_ending_today_or_upcoming_is_current(self) -> None:
        ending_today = [make_allocation(1, pct=60, start=-5, end=0), make_allocation(2, pct=60, start=-5, end=0)]
        upcoming = [make_allocation(1, pct=60, start=5, end=9), make_allocation(2, pct=60, start=5, end=9)]
        assert analyze_capacity(ending_today, T)[1].status == OVER_ALLOCATED
        upcoming_status = analyze_capacity(upcoming, T)[1]
        assert (upcoming_status.status, upcoming_status.current_load) == (OVER_ALLOCATED, 0)

    def test_past_conflict_is_listed_but_not_current(self) -> None:
        allocations = [make_allocation(1, pct=60, start=-9, end=-1), make_allocation(2, pct=60, start=-9, end=-1)]
        employee = analyze_capacity(allocations, T)[1]
        assert spans(employee.conflicts) == [(-9, -1, 120, (1, 2))]
        assert (employee.peak_load, employee.current_load, employee.status) == (120, 0, AVAILABLE)
        assert current_conflicts(employee, T) == ()
        assert current_conflicts(employee, day(-1)) == employee.conflicts

    def test_fully_allocated_at_exactly_100(self) -> None:
        current = [make_allocation(1, pct=50, start=-3, end=3), make_allocation(2, pct=50, start=-3, end=3)]
        past = [make_allocation(1, pct=50, start=-9, end=-1), make_allocation(2, pct=50, start=-9, end=-1)]
        employee = analyze_capacity(current, T)[1]
        assert (employee.status, employee.current_load, employee.conflicts) == (FULLY_ALLOCATED, 100, ())
        assert analyze_capacity(past, T)[1].status == AVAILABLE

    def test_available_with_current_load(self) -> None:
        employee = analyze_capacity([make_allocation(1, pct=80, start=-30, end=25)], T)[1]
        assert (employee.status, employee.peak_load, employee.current_load) == (AVAILABLE, 80, 80)

    def test_people_are_keyed_by_user_and_ordered_by_name(self) -> None:
        allocations = [
            make_allocation(1, user_id=9, user_name="sana Khan", department_id=4),
            make_allocation(2, user_id=6, user_name="Arjun Mehta", department_id=None),
            make_allocation(3, user_id=5, user_name="Priya Nair"),
        ]
        capacity = analyze_capacity(allocations, T)
        assert list(capacity) == [6, 5, 9]
        assert (capacity[9].department_id, capacity[6].department_id) == (4, None)

    def test_person_with_only_invalid_ranges(self) -> None:
        employee = analyze_capacity([make_allocation(1, start=5, end=4)], T)[1]
        assert (employee.segments, employee.peak_load, employee.status) == ((), 0, AVAILABLE)


class TestCompoundBottlenecks:
    """A current conflict plus responsibility for a root-cause or impacted deliverable."""

    @staticmethod
    def _over_allocated(user_id: int, *, deliverable_id: int | None = None, start: int = -2, end: int = 12) -> list:
        """Two 60% allocations that overlap between ``start`` and ``end``."""
        window = {"user_id": user_id, "pct": 60, "start": start, "end": end}
        return [
            make_allocation(user_id * 10 + 1, deliverable_id=deliverable_id, **window),
            make_allocation(user_id * 10 + 2, project_id=2, **window),
        ]

    def _bottlenecks(self, deliverables: list, allocations: list) -> dict[int, frozenset[int]]:
        """Run the dependency and capacity engines, then find the bottlenecks."""
        edges = [make_edge(1, 2), make_edge(2, 3)]
        analysis = analyze_dependencies(deliverables, edges, T)
        capacity = analyze_capacity(allocations, T)
        return compound_bottlenecks(capacity, deliverables, allocations, analysis, T)

    def test_over_allocated_owner_of_a_root_cause(self) -> None:
        deliverables = [make_deliverable(1, status="BLOCKED", assignee=5), make_deliverable(2), make_deliverable(3)]
        assert self._bottlenecks(deliverables, self._over_allocated(5)) == {5: frozenset({1})}

    def test_over_allocated_and_allocated_to_an_impacted_deliverable(self) -> None:
        deliverables = [make_deliverable(1, status="BLOCKED"), make_deliverable(2), make_deliverable(3)]
        assert self._bottlenecks(deliverables, self._over_allocated(6, deliverable_id=3)) == {6: frozenset({3})}

    def test_owner_and_allocation_links_are_combined(self) -> None:
        deliverables = [make_deliverable(1, status="BLOCKED", assignee=5), make_deliverable(2), make_deliverable(3)]
        assert self._bottlenecks(deliverables, self._over_allocated(5, deliverable_id=2)) == {5: frozenset({1, 2})}

    def test_needs_a_conflict_that_has_not_ended(self) -> None:
        deliverables = [make_deliverable(1, status="BLOCKED", assignee=5), make_deliverable(2), make_deliverable(3)]
        past_conflict = self._over_allocated(5, start=-9, end=-1)
        no_conflict = [make_allocation(51, user_id=5, pct=80, start=-5, end=5)]
        assert self._bottlenecks(deliverables, past_conflict) == {}
        assert self._bottlenecks(deliverables, no_conflict) == {}

    def test_needs_a_root_cause_or_impacted_deliverable(self) -> None:
        on_track = [
            make_deliverable(1, assignee=5),
            make_deliverable(2),
            make_deliverable(3, status="DONE", assignee=5),
        ]
        assert self._bottlenecks(on_track, self._over_allocated(5, deliverable_id=1)) == {}
