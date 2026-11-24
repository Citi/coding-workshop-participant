"""Dependency engine: cycle checks, downstream impact and topological levels (spec section 9.1).

Edges point from predecessor to successor and may cross projects. Every
function that takes ``edges`` accepts ``DependencyEdge`` objects, rows with
``predecessor_deliverable_id`` and ``successor_deliverable_id`` attributes (ORM
objects or query rows), or plain ``(predecessor_id, successor_id)`` and
``(id, predecessor_id, successor_id)`` tuples.

A deliverable is a root cause when it is not DONE and is either BLOCKED or
past its due date. The impacted set is everything downstream of a root cause,
minus DONE deliverables and minus the root causes themselves.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any

from app.engines.types import (
    BLOCKED,
    DONE,
    DeliverableFact,
    DependencyAnalysis,
    DependencyEdge,
    ImpactedItem,
)

__all__ = [
    "DependencyAnalysis",
    "DependencyEdge",
    "ImpactedItem",
    "analyze_dependencies",
    "downstream",
    "edge_endpoints",
    "find_cycle_path",
    "is_overdue",
    "is_root_cause",
    "levels_as_columns",
    "successor_map",
    "topological_levels",
]

# Attribute pairs that name an edge's endpoints, in the order they are tried.
_ENDPOINT_ATTRIBUTES = (
    ("predecessor_id", "successor_id"),
    ("predecessor_deliverable_id", "successor_deliverable_id"),
)


def edge_endpoints(edge: Any) -> tuple[int, int]:
    """Return ``(predecessor_id, successor_id)`` for any supported edge shape."""
    for predecessor_attr, successor_attr in _ENDPOINT_ATTRIBUTES:
        if hasattr(edge, predecessor_attr):
            return int(getattr(edge, predecessor_attr)), int(getattr(edge, successor_attr))
    *_, predecessor_id, successor_id = edge
    return int(predecessor_id), int(successor_id)


def successor_map(edges: Iterable[Any]) -> dict[int, tuple[int, ...]]:
    """Index edges as ``{predecessor_id: successor ids in ascending order}``."""
    successors: dict[int, set[int]] = {}
    for edge in edges:
        predecessor_id, successor_id = edge_endpoints(edge)
        successors.setdefault(predecessor_id, set()).add(successor_id)
    return {node: tuple(sorted(targets)) for node, targets in successors.items()}


def _bfs_depths(successors: Mapping[int, tuple[int, ...]], start: int) -> dict[int, int]:
    """Breadth-first search from ``start``: ``{reachable id: depth}``, with ``start`` excluded."""
    depths: dict[int, int] = {}
    seen = {start}
    queue: deque[tuple[int, int]] = deque([(start, 0)])
    while queue:
        node, depth = queue.popleft()
        for successor in successors.get(node, ()):
            if successor not in seen:
                seen.add(successor)
                depths[successor] = depth + 1
                queue.append((successor, depth + 1))
    return depths


def downstream(edges: Iterable[Any], root_id: int) -> dict[int, int]:
    """Return every deliverable downstream of ``root_id`` with its BFS depth.

    Depth 1 is a direct successor. The root itself is never included, even when
    a (forbidden) cycle leads back to it.
    """
    return _bfs_depths(successor_map(edges), root_id)


def find_cycle_path(edges: Iterable[Any], predecessor_id: int, successor_id: int) -> list[int] | None:
    """Return the cycle that adding ``predecessor_id -> successor_id`` would close, or ``None``.

    A breadth-first search runs from the successor along the existing edges. If
    it reaches the predecessor, the new edge would close a loop, and the result
    lists the ids from the successor to the predecessor and back to the
    successor: adding End-to-End Testing -> API Schema returns
    ``[api_schema, payments_integration, end_to_end_testing, api_schema]``.
    BFS finds the shortest such loop. A self-edge returns ``[id, id]``.
    """
    if predecessor_id == successor_id:
        return [successor_id, successor_id]
    successors = successor_map(edges)
    parents: dict[int, int] = {}
    queue: deque[int] = deque([successor_id])
    seen = {successor_id}
    while queue:
        node = queue.popleft()
        for nxt in successors.get(node, ()):
            if nxt in seen:
                continue
            seen.add(nxt)
            parents[nxt] = node
            if nxt == predecessor_id:
                path = [nxt]
                while path[-1] != successor_id:
                    path.append(parents[path[-1]])
                path.reverse()
                path.append(successor_id)
                return path
            queue.append(nxt)
    return None


def is_overdue(deliverable: DeliverableFact, as_of: date) -> bool:
    """Return True when the deliverable is not DONE and its due date is before ``as_of``."""
    return deliverable.status != DONE and deliverable.due_date < as_of


def is_root_cause(deliverable: DeliverableFact, as_of: date) -> bool:
    """Return True when the deliverable is not DONE and is either BLOCKED or overdue."""
    return deliverable.status != DONE and (deliverable.status == BLOCKED or deliverable.due_date < as_of)


def analyze_dependencies(
    deliverables: Iterable[DeliverableFact], edges: Iterable[Any], as_of: date
) -> DependencyAnalysis:
    """Find the root causes and the impacted deliverables downstream of them.

    Edges whose endpoints are not among ``deliverables`` are ignored. Each
    impacted deliverable reports its nearest root cause (smallest depth; a tie
    goes to the lowest root id).
    """
    by_id = {deliverable.id: deliverable for deliverable in deliverables}
    pairs = (edge_endpoints(edge) for edge in edges)
    successors = successor_map(pair for pair in pairs if pair[0] in by_id and pair[1] in by_id)
    roots = sorted(item.id for item in by_id.values() if is_root_cause(item, as_of))
    root_set = set(roots)

    impacted: dict[int, ImpactedItem] = {}
    held_up: dict[int, tuple[int, ...]] = {}
    for root_id in roots:
        depths = _bfs_depths(successors, root_id)
        held_up[root_id] = tuple(
            sorted((node for node in depths if by_id[node].status != DONE), key=lambda node: (depths[node], node))
        )
        root_title = by_id[root_id].title
        for node_id, depth in depths.items():
            node = by_id[node_id]
            if node_id in root_set or node.status == DONE:
                continue
            current = impacted.get(node_id)
            if current is None or depth < current.depth:
                impacted[node_id] = ImpactedItem(
                    id=node_id,
                    title=node.title,
                    project_id=node.project_id,
                    depth=depth,
                    caused_by_id=root_id,
                    caused_by_title=root_title,
                )

    ordered = dict(sorted(impacted.items(), key=lambda entry: (entry[1].depth, entry[0])))
    return DependencyAnalysis(root_cause_ids=tuple(roots), impacted=ordered, held_up_by_root=held_up)


def topological_levels(node_ids: Iterable[int], edges: Iterable[Any]) -> dict[int, int]:
    """Assign each node a level with Kahn's algorithm: the longest distance from a source.

    Sources (no predecessor among ``node_ids``) are level 0. Edges with an
    endpoint outside ``node_ids`` are ignored, so a project's chain can be
    drawn on its own. Nodes in or downstream of a cycle (which the API
    prevents) cannot be ordered and are placed in one extra level after the
    deepest one, so that no node is ever dropped. The result is ordered by
    node id.
    """
    nodes = sorted(set(node_ids))
    node_set = set(nodes)
    successors: dict[int, list[int]] = {node: [] for node in nodes}
    indegree = dict.fromkeys(nodes, 0)
    for edge in edges:
        predecessor_id, successor_id = edge_endpoints(edge)
        if predecessor_id in node_set and successor_id in node_set:
            successors[predecessor_id].append(successor_id)
            indegree[successor_id] += 1

    levels = dict.fromkeys(nodes, 0)
    placed: set[int] = set()
    queue: deque[int] = deque(node for node in nodes if indegree[node] == 0)
    while queue:
        node = queue.popleft()
        placed.add(node)
        for successor in sorted(successors[node]):
            levels[successor] = max(levels[successor], levels[node] + 1)
            indegree[successor] -= 1
            if indegree[successor] == 0:
                queue.append(successor)

    unplaced = [node for node in nodes if node not in placed]
    if unplaced:
        extra_level = max((levels[node] for node in placed), default=-1) + 1
        for node in unplaced:
            levels[node] = extra_level
    return levels


def levels_as_columns(levels: Mapping[int, int]) -> list[list[int]]:
    """Group ``{node_id: level}`` into columns: ``[[ids at level 0], [ids at level 1], ...]``."""
    if not levels:
        return []
    columns: list[list[int]] = [[] for _ in range(max(levels.values()) + 1)]
    for node_id in sorted(levels):
        columns[levels[node_id]].append(node_id)
    return columns
