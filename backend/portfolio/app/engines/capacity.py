"""Capacity engine: a per-person sweep line over allocations (spec section 9.2).

Each allocation adds its percentage on its start date and removes it the day
after its end date, because end dates are inclusive. Walking the sorted dates
gives segments in which a person's set of active allocations does not change.
A segment with a load above 100 is a conflict.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, timedelta

from app.engines.types import (
    AVAILABLE,
    FULLY_ALLOCATED,
    OVER_ALLOCATED,
    AllocationFact,
    DeliverableFact,
    DependencyAnalysis,
    EmployeeCapacity,
    Segment,
)

__all__ = [
    "AVAILABLE",
    "FULLY_ALLOCATED",
    "FULL_LOAD",
    "OVER_ALLOCATED",
    "EmployeeCapacity",
    "Segment",
    "analyze_capacity",
    "compound_bottlenecks",
    "current_conflicts",
    "sweep",
]

#: A load above this many percentage points is a conflict.
FULL_LOAD = 100

_ONE_DAY = timedelta(days=1)


def sweep(allocations: Iterable[AllocationFact]) -> list[Segment]:
    """Turn one person's allocations into consecutive load segments.

    A new segment starts whenever the set of active allocations changes, so two
    back-to-back allocations of the same size still give two segments. Days on
    which nothing is active produce no segment. Allocations whose end date is
    before their start date are ignored (the database forbids them). An
    allocation ending on ``date.max`` never ends, so its last segment ends on
    ``date.max`` too.
    """
    starts: dict[date, list[AllocationFact]] = {}
    stops: dict[date, list[int]] = {}
    for allocation in allocations:
        if allocation.end_date < allocation.start_date:
            continue
        starts.setdefault(allocation.start_date, []).append(allocation)
        if allocation.end_date < date.max:
            stops.setdefault(allocation.end_date + _ONE_DAY, []).append(allocation.id)

    days = sorted(starts.keys() | stops.keys())
    active: dict[int, int] = {}
    segments: list[Segment] = []
    for index, day in enumerate(days):
        for allocation_id in stops.get(day, ()):
            active.pop(allocation_id, None)
        for allocation in starts.get(day, ()):
            active[allocation.id] = allocation.allocation_percentage
        if active:
            end = days[index + 1] - _ONE_DAY if index + 1 < len(days) else date.max
            segments.append(
                Segment(start_date=day, end_date=end, load=sum(active.values()), allocation_ids=tuple(sorted(active)))
            )
    return segments


def _status(segments: tuple[Segment, ...], conflicts: tuple[Segment, ...], as_of: date) -> str:
    """Classify a person as OVER_ALLOCATED, FULLY_ALLOCATED or AVAILABLE as of a date."""
    if any(conflict.end_date >= as_of for conflict in conflicts):
        return OVER_ALLOCATED
    if any(segment.load == FULL_LOAD and segment.end_date >= as_of for segment in segments):
        return FULLY_ALLOCATED
    return AVAILABLE


def analyze_capacity(allocations: Iterable[AllocationFact], as_of: date) -> dict[int, EmployeeCapacity]:
    """Sweep every person's allocations and classify them as of ``as_of``.

    ``status`` is OVER_ALLOCATED if any conflict ends on or after ``as_of``,
    else FULLY_ALLOCATED if any segment at exactly 100 ends on or after
    ``as_of``, else AVAILABLE. ``current_load`` is the load of the segment
    containing ``as_of`` (0 if none) and ``peak_load`` the highest load of any
    segment. The result is keyed by user id and ordered by name.
    """
    by_user: dict[int, list[AllocationFact]] = {}
    for allocation in allocations:
        by_user.setdefault(allocation.user_id, []).append(allocation)

    result: dict[int, EmployeeCapacity] = {}
    for user_id, items in sorted(by_user.items(), key=lambda entry: (entry[1][0].user_name.lower(), entry[0])):
        segments = tuple(sweep(items))
        conflicts = tuple(segment for segment in segments if segment.load > FULL_LOAD)
        result[user_id] = EmployeeCapacity(
            user_id=user_id,
            user_name=items[0].user_name,
            department_id=items[0].user_department_id,
            peak_load=max((segment.load for segment in segments), default=0),
            current_load=next(
                (segment.load for segment in segments if segment.start_date <= as_of <= segment.end_date), 0
            ),
            segments=segments,
            conflicts=conflicts,
            status=_status(segments, conflicts, as_of),
        )
    return result


def current_conflicts(employee: EmployeeCapacity, as_of: date) -> tuple[Segment, ...]:
    """Return the person's conflicts that have not ended by ``as_of`` (in progress or upcoming)."""
    return tuple(conflict for conflict in employee.conflicts if conflict.end_date >= as_of)


def compound_bottlenecks(
    capacity: Mapping[int, EmployeeCapacity],
    deliverables: Iterable[DeliverableFact],
    allocations: Iterable[AllocationFact],
    analysis: DependencyAnalysis,
    as_of: date,
) -> dict[int, frozenset[int]]:
    """Find people who are over-allocated now and responsible for late or held-up work.

    A compound bottleneck has a conflict that has not ended by ``as_of`` and is
    the assignee of, or allocated to (``AllocationFact.deliverable_id``), a
    root-cause or impacted deliverable. The result maps each such user id to
    those deliverable ids.
    """
    flagged = set(analysis.root_cause_ids) | set(analysis.impacted)
    linked: dict[int, set[int]] = {}
    for deliverable in deliverables:
        if deliverable.assigned_user_id is not None and deliverable.id in flagged:
            linked.setdefault(deliverable.assigned_user_id, set()).add(deliverable.id)
    for allocation in allocations:
        if allocation.deliverable_id in flagged:
            linked.setdefault(allocation.user_id, set()).add(allocation.deliverable_id)
    return {
        user_id: frozenset(linked[user_id])
        for user_id, employee in capacity.items()
        if user_id in linked and current_conflicts(employee, as_of)
    }
