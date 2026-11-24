"""Request and response models for dependency edges and a project's dependency graph."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import RequestModel, ResponseModel
from app.schemas.deliverables import DeliverableStatus
from app.schemas.departments import RecordId


class DependencyCreate(RequestModel):
    """Body of ``POST /dependencies`` (ADMIN, PM, LEAD): the successor depends on the predecessor."""

    predecessor_deliverable_id: RecordId
    successor_deliverable_id: RecordId


class DependencyOut(ResponseModel):
    """A dependency edge with the titles and projects of both ends (edges may cross projects)."""

    id: int
    predecessor_deliverable_id: int
    predecessor_title: str
    predecessor_project_id: int
    successor_deliverable_id: int
    successor_title: str
    successor_project_id: int
    created_at: datetime


class GraphNodeOut(BaseModel):
    """One card of the dependency graph.

    ``level`` is the column (longest distance from a node without predecessors).
    ``is_external`` marks a deliverable of another project that is directly linked
    to this one. ``predecessor_ids`` lists the node's predecessors within the graph.
    """

    id: int
    title: str
    project_id: int
    status: DeliverableStatus
    completion_percentage: int
    due_date: date
    assigned_user_name: str | None
    level: int
    is_root_cause: bool
    is_impacted: bool
    is_external: bool
    predecessor_ids: list[int]


class GraphEdgeOut(BaseModel):
    """An edge between two nodes of the graph."""

    id: int
    predecessor_deliverable_id: int
    successor_deliverable_id: int


class GraphImpactOut(BaseModel):
    """A node held up by a root cause: its BFS depth from that root and the root's title."""

    id: int
    title: str
    depth: int
    caused_by: str


class DependencyGraphOut(BaseModel):
    """Response of ``GET /projects/{id}/dependency-graph``.

    ``levels`` groups node ids into columns (level 0 first); ``roots`` are the
    root causes among the nodes (not DONE and BLOCKED or overdue on ``as_of``);
    ``impacted`` lists the nodes downstream of any root cause, nearest first.
    """

    project_id: int
    as_of: date
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]
    levels: list[list[int]]
    roots: list[int]
    impacted: list[GraphImpactOut]
