"""Dependency edges between deliverables: listing, cycle-safe creation, deletion and project graphs.

Edges point from predecessor to successor and may cross projects. Creating an
edge checks, in this order: not a self-edge (400 ``VALIDATION_ERROR``), both
deliverables exist (400 ``INVALID_REFERENCE``), not a duplicate (409
``CONFLICT``). Then, in the same transaction, it takes
``pg_advisory_xact_lock(74001)``, reloads every edge, rejects a cycle (400
``DEPENDENCY_CYCLE``, with the path spelled out by title) and inserts the edge
with its audit row.

The lock serialises concurrent creates: two edges that are each safe on their
own, such as A -> B and B -> A, can never both be committed. This relies on
PostgreSQL's default READ COMMITTED isolation: the edges are read by a
statement that starts after the lock is granted, so they include every edge
committed by the previous holder of the lock.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import Row, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.db.models import Deliverable, DeliverableDependency, User
from app.db.session import transaction
from app.engines.dependency import (
    analyze_dependencies,
    find_cycle_path,
    levels_as_columns,
    topological_levels,
)
from app.errors import Conflict, DependencyCycle, InvalidReference, NotFound, ValidationFailed
from app.schemas.dependencies import (
    DependencyCreate,
    DependencyGraphOut,
    DependencyOut,
    GraphEdgeOut,
    GraphImpactOut,
    GraphNodeOut,
)
from app.services.audit import record_audit, to_state
from app.services.portfolio import load_snapshot

ENTITY_TYPE = "dependency"

# Key of the transaction-level advisory lock that serialises dependency creation (spec section 8).
ADVISORY_LOCK_KEY = 74001

# Separator used to spell out a cycle by title: "A → B → C → A" (U+2192 with spaces).
PATH_SEPARATOR = " → "

_UNIQUE_VIOLATION = "23505"
_FOREIGN_KEY_VIOLATION = "23503"

_PREDECESSOR = aliased(Deliverable, name="predecessor")
_SUCCESSOR = aliased(Deliverable, name="successor")

# Edges with the title and project of both ends, as plain columns; labels match ``DependencyOut``.
_DEPENDENCY_COLUMNS = (
    select(
        DeliverableDependency.id,
        DeliverableDependency.predecessor_deliverable_id,
        _PREDECESSOR.title.label("predecessor_title"),
        _PREDECESSOR.project_id.label("predecessor_project_id"),
        DeliverableDependency.successor_deliverable_id,
        _SUCCESSOR.title.label("successor_title"),
        _SUCCESSOR.project_id.label("successor_project_id"),
        DeliverableDependency.created_at,
    )
    .join(_PREDECESSOR, _PREDECESSOR.id == DeliverableDependency.predecessor_deliverable_id)
    .join(_SUCCESSOR, _SUCCESSOR.id == DeliverableDependency.successor_deliverable_id)
)

# Every edge, read under the advisory lock for the cycle check.
_ALL_EDGES = select(
    DeliverableDependency.id,
    DeliverableDependency.predecessor_deliverable_id,
    DeliverableDependency.successor_deliverable_id,
).order_by(DeliverableDependency.id)


def list_dependencies(
    db: Session, *, project_id: int | None = None, limit: int = 50, offset: int = 0
) -> tuple[list[Row[Any]], int]:
    """Return one page of edges ordered by id, plus the total number of matches.

    With ``project_id``, an edge matches when either end belongs to that project.
    """
    query = _DEPENDENCY_COLUMNS
    if project_id is not None:
        query = query.where(or_(_PREDECESSOR.project_id == project_id, _SUCCESSOR.project_id == project_id))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(DeliverableDependency.id).limit(limit).offset(offset)).all()
    return list(rows), total


def _duplicate(predecessor: Row[Any], successor: Row[Any]) -> Conflict:
    """Build the 409 for an edge that already exists."""
    return Conflict(
        f"'{successor.title}' already depends on '{predecessor.title}'.",
        details=[{"field": "successor_deliverable_id", "issue": "This dependency already exists."}],
    )


def _load_ends(db: Session, predecessor_id: int, successor_id: int) -> dict[int, Row[Any]]:
    """Load both ends of a new edge; raise 400 ``INVALID_REFERENCE`` naming each missing one."""
    rows = {
        row.id: row
        for row in db.execute(
            select(Deliverable.id, Deliverable.title, Deliverable.project_id).where(
                Deliverable.id.in_((predecessor_id, successor_id))
            )
        )
    }
    missing = [
        (field, record_id)
        for field, record_id in (
            ("predecessor_deliverable_id", predecessor_id),
            ("successor_deliverable_id", successor_id),
        )
        if record_id not in rows
    ]
    if missing:
        ids = " and ".join(str(record_id) for _, record_id in missing)
        message = f"Deliverable {ids} does not exist." if len(missing) == 1 else f"Deliverables {ids} do not exist."
        raise InvalidReference(
            message,
            details=[
                {"field": field, "issue": f"No deliverable has id {record_id}."} for field, record_id in missing
            ],
        )
    return rows


def _cycle(db: Session, path: list[int]) -> DependencyCycle:
    """Build the 400 for an edge that would close ``path``, spelled out by title."""
    titles = dict(db.execute(select(Deliverable.id, Deliverable.title).where(Deliverable.id.in_(set(path)))).all())
    spelled = PATH_SEPARATOR.join(titles.get(node, f"Deliverable {node}") for node in path)
    return DependencyCycle(
        f"This dependency would create a cycle: {spelled}",
        details=[{"field": "successor_deliverable_id", "issue": spelled}],
    )


def _flush_edge(db: Session, predecessor: Row[Any], successor: Row[Any]) -> None:
    """Flush the new edge, turning constraint races into the same errors as the checks."""
    try:
        db.flush()
    except IntegrityError as exc:
        sqlstate = getattr(exc.orig, "sqlstate", None)
        if sqlstate == _UNIQUE_VIOLATION:
            raise _duplicate(predecessor, successor) from exc
        if sqlstate == _FOREIGN_KEY_VIOLATION:
            raise InvalidReference(
                "One of the deliverables was deleted while the dependency was being added."
            ) from exc
        raise


def create_dependency(db: Session, *, actor: User, data: DependencyCreate) -> DependencyOut:
    """Add the edge predecessor -> successor with one CREATE audit row, in one transaction.

    Checks run in the order of the module docstring; the cycle check and the
    insert happen under ``pg_advisory_xact_lock(74001)``.
    """
    predecessor_id = data.predecessor_deliverable_id
    successor_id = data.successor_deliverable_id
    with transaction(db):
        if predecessor_id == successor_id:
            raise ValidationFailed(
                "A deliverable cannot depend on itself.",
                details=[
                    {
                        "field": "successor_deliverable_id",
                        "issue": "The predecessor and the successor must be different deliverables.",
                    }
                ],
            )
        ends = _load_ends(db, predecessor_id, successor_id)
        predecessor, successor = ends[predecessor_id], ends[successor_id]
        existing = select(DeliverableDependency.id).where(
            DeliverableDependency.predecessor_deliverable_id == predecessor_id,
            DeliverableDependency.successor_deliverable_id == successor_id,
        )
        if db.scalar(existing) is not None:
            raise _duplicate(predecessor, successor)

        db.execute(select(func.pg_advisory_xact_lock(ADVISORY_LOCK_KEY)))
        edges = db.execute(_ALL_EDGES).all()
        if any(
            edge.predecessor_deliverable_id == predecessor_id and edge.successor_deliverable_id == successor_id
            for edge in edges
        ):
            raise _duplicate(predecessor, successor)
        path = find_cycle_path(edges, predecessor_id, successor_id)
        if path is not None:
            raise _cycle(db, path)

        edge = DeliverableDependency(predecessor_deliverable_id=predecessor_id, successor_deliverable_id=successor_id)
        db.add(edge)
        _flush_edge(db, predecessor, successor)
        after = to_state(edge)
        after.update(predecessor_title=predecessor.title, successor_title=successor.title)
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=edge.id,
            action="CREATE",
            before=None,
            after=after,
        )
    return DependencyOut(
        id=edge.id,
        predecessor_deliverable_id=predecessor.id,
        predecessor_title=predecessor.title,
        predecessor_project_id=predecessor.project_id,
        successor_deliverable_id=successor.id,
        successor_title=successor.title,
        successor_project_id=successor.project_id,
        created_at=edge.created_at,
    )


def delete_dependency(db: Session, *, actor: User, dependency_id: int) -> None:
    """Remove an edge and write one DELETE audit row, in one transaction; 404 when it does not exist."""
    with transaction(db):
        edge = db.get(DeliverableDependency, dependency_id)
        if edge is None:
            raise NotFound(f"Dependency {dependency_id} was not found.")
        before = to_state(edge)
        before.update(predecessor_title=edge.predecessor.title, successor_title=edge.successor.title)
        db.delete(edge)
        db.flush()
        record_audit(
            db,
            actor=actor,
            entity_type=ENTITY_TYPE,
            entity_id=before["id"],
            action="DELETE",
            before=before,
            after=None,
        )


def dependency_graph(db: Session, *, project_id: int, as_of: date) -> DependencyGraphOut:
    """Build a project's dependency graph from one portfolio snapshot.

    Nodes are the project's deliverables plus deliverables of other projects
    linked to them by an edge (``is_external``). Edges are every edge between two
    nodes. Root causes and impacted deliverables come from the whole portfolio
    (``analyze_dependencies`` on ``as_of``), so an upstream problem in another
    project shows up here too. Raises 404 for an unknown project.
    """
    snapshot = load_snapshot(db)
    if all(project.id != project_id for project in snapshot.projects):
        raise NotFound(f"Project {project_id} was not found.")
    analysis = analyze_dependencies(snapshot.deliverables, snapshot.dependencies, as_of)
    by_id = {item.id: item for item in snapshot.deliverables}
    known_edges = [
        edge for edge in snapshot.dependencies if edge.predecessor_id in by_id and edge.successor_id in by_id
    ]
    own_ids = {item.id for item in snapshot.deliverables if item.project_id == project_id}
    node_ids = set(own_ids)
    for edge in known_edges:
        if edge.predecessor_id in own_ids or edge.successor_id in own_ids:
            node_ids.update((edge.predecessor_id, edge.successor_id))
    edges = [edge for edge in known_edges if edge.predecessor_id in node_ids and edge.successor_id in node_ids]

    levels = topological_levels(node_ids, edges)
    predecessors: dict[int, list[int]] = {node_id: [] for node_id in node_ids}
    for edge in edges:
        predecessors[edge.successor_id].append(edge.predecessor_id)
    root_ids = set(analysis.root_cause_ids)
    nodes = [
        GraphNodeOut(
            id=node_id,
            title=by_id[node_id].title,
            project_id=by_id[node_id].project_id,
            status=by_id[node_id].status,
            completion_percentage=by_id[node_id].completion_percentage,
            due_date=by_id[node_id].due_date,
            assigned_user_name=by_id[node_id].assigned_user_name,
            level=levels[node_id],
            is_root_cause=node_id in root_ids,
            is_impacted=node_id in analysis.impacted,
            is_external=node_id not in own_ids,
            predecessor_ids=sorted(predecessors[node_id]),
        )
        for node_id in sorted(node_ids, key=lambda node_id: (levels[node_id], node_id))
    ]
    return DependencyGraphOut(
        project_id=project_id,
        as_of=as_of,
        nodes=nodes,
        edges=[
            GraphEdgeOut(
                id=edge.id,
                predecessor_deliverable_id=edge.predecessor_id,
                successor_deliverable_id=edge.successor_id,
            )
            for edge in edges
        ],
        levels=levels_as_columns(levels),
        roots=sorted(node_ids & root_ids),
        impacted=[
            GraphImpactOut(id=item.id, title=item.title, depth=item.depth, caused_by=item.caused_by_title)
            for item in analysis.impacted.values()
            if item.id in node_ids
        ],
    )
