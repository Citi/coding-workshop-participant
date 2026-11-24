"""Dependencies API and project dependency graph: cycle rejection, RBAC, audit and the advisory lock.

Covers spec sections 8 ("Dependency create"), 9.1 and 13.1 (Dependencies, RBAC, Transactions).
"""

from __future__ import annotations

import secrets
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Row, create_engine, delete, func, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.api.deps import today_utc
from app.config import get_settings
from app.db.models import AuditLog, Deliverable, DeliverableDependency, Department, Project, User
from app.db.seed import seed_portfolio
from app.db.session import build_connect_args, build_url
from app.errors import AppError
from app.schemas.dependencies import DependencyCreate
from app.security import create_access_token
from app.services import dependencies as dependencies_service

SEED_PASSWORD = secrets.token_urlsafe(12)
# A fixed anchor date for the seed, so graph results do not depend on the day the tests run.
T = date(2026, 11, 25)
ROLE_EMAILS = {
    "ADMIN": "admin@acme.example",
    "PM": "pm@acme.example",
    "LEAD": "lead@acme.example",
    "VIEWER": "viewer@acme.example",
}
DEPENDENCY_KEYS = {
    "id",
    "predecessor_deliverable_id",
    "predecessor_title",
    "predecessor_project_id",
    "successor_deliverable_id",
    "successor_title",
    "successor_project_id",
    "created_at",
}
GRAPH_KEYS = {"project_id", "as_of", "nodes", "edges", "levels", "roots", "impacted"}
NODE_KEYS = {
    "id",
    "title",
    "project_id",
    "status",
    "completion_percentage",
    "due_date",
    "assigned_user_name",
    "level",
    "is_root_cause",
    "is_impacted",
    "is_external",
    "predecessor_ids",
}
CYCLE_PATH = "API Schema → Payments Service Integration → End-to-End Testing → API Schema"
SEEDED_EDGES = 14
MISSING_ID = 999_999


@dataclass(frozen=True)
class World:
    """The seeded spec section 10 data: ids by title, project and person, plus demo-user headers."""

    today: date
    deliverables: dict[str, int]
    projects: dict[str, int]
    user_ids: dict[str, int]
    role_headers: dict[str, dict[str, str]]

    def headers(self, role: str) -> dict[str, str]:
        """Authorization header for the demo user with ``role``."""
        return self.role_headers[role]

    def edge(self, predecessor: str, successor: str) -> dict[str, int]:
        """Body of ``POST /dependencies`` for two deliverables named by title."""
        return {
            "predecessor_deliverable_id": self.deliverables[predecessor],
            "successor_deliverable_id": self.deliverables[successor],
        }


def seed_world(db: Session, anchor: date) -> World:
    """Seed spec section 10 anchored on ``anchor`` and index the rows the tests need."""
    seed_portfolio(db, SEED_PASSWORD, today=anchor)
    db.commit()
    users = list(db.scalars(select(User)))
    return World(
        today=anchor,
        deliverables={title: row_id for row_id, title in db.execute(select(Deliverable.id, Deliverable.title))},
        projects={
            name.split(":")[0].removeprefix("Project "): row_id
            for row_id, name in db.execute(select(Project.id, Project.project_name))
        },
        user_ids={user.name: user.id for user in users},
        role_headers={
            role: {"Authorization": f"Bearer {create_access_token(next(u for u in users if u.email == email))}"}
            for role, email in ROLE_EMAILS.items()
        },
    )


@pytest.fixture
def world(db_session: Session) -> World:
    """Spec section 10 seeded at the fixed date ``T``."""
    return seed_world(db_session, T)


@pytest.fixture
def world_today(db_session: Session) -> World:
    """Spec section 10 seeded on today's UTC date, for routes whose ``as_of`` defaults to today."""
    return seed_world(db_session, today_utc())


def error_of(response: httpx.Response) -> tuple[int, str]:
    """Status code and error code of an error response."""
    return response.status_code, response.json()["error"]


def fields_of(response: httpx.Response) -> set[str]:
    """Field names in an error response's details."""
    return {detail["field"] for detail in response.json()["details"]}


def edge_count(db: Session) -> int:
    """Number of dependency edges in the database."""
    return db.scalar(select(func.count()).select_from(DeliverableDependency)) or 0


def audit_rows(db: Session, entity_type: str = "dependency") -> list[Row[Any]]:
    """Audit rows for one entity type, oldest first (read fresh from the database)."""
    return list(
        db.execute(
            select(
                AuditLog.action, AuditLog.entity_id, AuditLog.actor_id, AuditLog.before_state, AuditLog.after_state
            )
            .where(AuditLog.entity_type == entity_type)
            .order_by(AuditLog.id)
        )
    )


def graph_of(client: TestClient, world: World, project: str, **params: Any) -> dict[str, Any]:
    """``GET /projects/{id}/dependency-graph`` for a seeded project (as_of = T unless given)."""
    params.setdefault("as_of", world.today.isoformat())
    response = client.get(
        f"/projects/{world.projects[project]}/dependency-graph", params=params, headers=world.headers("VIEWER")
    )
    assert response.status_code == 200, response.text
    return response.json()


def named(world: World, ids: list[int]) -> list[str]:
    """Titles for deliverable ids, in order."""
    by_id = {row_id: title for title, row_id in world.deliverables.items()}
    return [by_id[row_id] for row_id in ids]


# --- Listing ----------------------------------------------------------------------------------------


def test_list_dependencies_with_titles_and_projects(client: TestClient, world: World) -> None:
    """GET /dependencies lists every edge by id with both ends' titles and projects."""
    response = client.get("/dependencies", params={"limit": 200}, headers=world.headers("VIEWER"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == SEEDED_EDGES and len(body["items"]) == SEEDED_EDGES
    assert all(set(item) == DEPENDENCY_KEYS for item in body["items"])
    assert [item["id"] for item in body["items"]] == sorted(item["id"] for item in body["items"])
    first = body["items"][0]
    assert (first["predecessor_title"], first["successor_title"]) == ("Requirements Sign-off", "API Schema")
    assert first["predecessor_project_id"] == first["successor_project_id"] == world.projects["Alpha"]

    page = client.get("/dependencies", params={"limit": 3, "offset": 3}, headers=world.headers("VIEWER")).json()
    assert page["total"] == SEEDED_EDGES
    assert [item["id"] for item in page["items"]] == [item["id"] for item in body["items"][3:6]]


def test_list_filter_matches_edges_with_either_end_in_the_project(client: TestClient, world: World) -> None:
    """project_id keeps edges whose predecessor or successor belongs to the project."""
    viewer = world.headers("VIEWER")

    def pairs(project: str) -> set[tuple[str, str]]:
        response = client.get("/dependencies", params={"project_id": world.projects[project]}, headers=viewer)
        assert response.status_code == 200, response.text
        return {(item["predecessor_title"], item["successor_title"]) for item in response.json()["items"]}

    assert pairs("Alpha") == {
        ("Requirements Sign-off", "API Schema"),
        ("API Schema", "Payments Service Integration"),
        ("API Schema", "Mobile Client Integration"),
        ("Payments Service Integration", "End-to-End Testing"),
    }
    assert len(pairs("Epsilon")) == 2
    created = client.post(
        "/dependencies", json=world.edge("Data Migration Plan", "Month-End Close Pilot"), headers=world.headers("PM")
    )
    assert created.status_code == 201, created.text
    assert ("Data Migration Plan", "Month-End Close Pilot") in pairs("Alpha")
    assert ("Data Migration Plan", "Month-End Close Pilot") in pairs("Gamma")
    assert len(pairs("Gamma")) == 4
    unknown = client.get("/dependencies", params={"project_id": MISSING_ID}, headers=viewer).json()
    assert unknown == {"items": [], "total": 0}


# --- Create ---------------------------------------------------------------------------------------------


def test_create_dependency(client: TestClient, world: World, db_session: Session) -> None:
    """POST 201 returns the edge with titles; it is listed and audited once with the actor."""
    response = client.post(
        "/dependencies", json=world.edge("Data Migration Plan", "End-to-End Testing"), headers=world.headers("PM")
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert set(body) == DEPENDENCY_KEYS
    assert (body["predecessor_title"], body["successor_title"]) == ("Data Migration Plan", "End-to-End Testing")
    assert body["predecessor_project_id"] == body["successor_project_id"] == world.projects["Alpha"]
    assert edge_count(db_session) == SEEDED_EDGES + 1
    (row,) = audit_rows(db_session)
    assert (row.action, row.entity_id, row.actor_id, row.before_state) == (
        "CREATE",
        body["id"],
        world.user_ids["Vikram Shah"],
        None,
    )
    assert row.after_state["predecessor_deliverable_id"] == world.deliverables["Data Migration Plan"]
    assert row.after_state["successor_title"] == "End-to-End Testing"


def test_cycle_is_rejected_with_the_path_spelled_by_title(
    client: TestClient, world: World, db_session: Session
) -> None:
    """End-to-End Testing -> API Schema closes API Schema -> Payments -> E2E -> API Schema: 400, nothing written."""
    response = client.post(
        "/dependencies", json=world.edge("End-to-End Testing", "API Schema"), headers=world.headers("PM")
    )
    assert error_of(response) == (400, "DEPENDENCY_CYCLE"), response.text
    body = response.json()
    assert CYCLE_PATH in body["message"]
    assert body["details"] == [{"field": "successor_deliverable_id", "issue": CYCLE_PATH}]
    assert edge_count(db_session) == SEEDED_EDGES
    assert audit_rows(db_session) == []


def test_cycle_across_projects_is_rejected(client: TestClient, world: World, db_session: Session) -> None:
    """The cycle check follows edges into other projects."""
    lead = world.headers("LEAD")
    bridge = client.post("/dependencies", json=world.edge("End-to-End Testing", "Brand Guidelines"), headers=lead)
    assert bridge.status_code == 201, bridge.text
    response = client.post("/dependencies", json=world.edge("Launch Event", "Requirements Sign-off"), headers=lead)
    assert error_of(response) == (400, "DEPENDENCY_CYCLE")
    assert response.json()["details"][0]["issue"] == (
        "Requirements Sign-off → API Schema → Payments Service Integration → End-to-End Testing"
        " → Brand Guidelines → Campaign Creative → Launch Event → Requirements Sign-off"
    )
    assert edge_count(db_session) == SEEDED_EDGES + 1
    assert [row.action for row in audit_rows(db_session)] == ["CREATE"]


def test_duplicate_edge_is_a_conflict(client: TestClient, world: World, db_session: Session) -> None:
    """Adding an existing edge again gives 409 CONFLICT and no audit row."""
    response = client.post(
        "/dependencies", json=world.edge("Requirements Sign-off", "API Schema"), headers=world.headers("ADMIN")
    )
    assert error_of(response) == (409, "CONFLICT")
    assert edge_count(db_session) == SEEDED_EDGES
    assert audit_rows(db_session) == []


def test_self_edge_is_rejected_first(client: TestClient, world: World, db_session: Session) -> None:
    """A self-edge is 400 VALIDATION_ERROR, checked before the ids are looked up."""
    api_schema = world.deliverables["API Schema"]
    response = client.post(
        "/dependencies",
        json={"predecessor_deliverable_id": api_schema, "successor_deliverable_id": api_schema},
        headers=world.headers("PM"),
    )
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert fields_of(response) == {"successor_deliverable_id"}
    unknown_self = client.post(
        "/dependencies",
        json={"predecessor_deliverable_id": MISSING_ID, "successor_deliverable_id": MISSING_ID},
        headers=world.headers("PM"),
    )
    assert error_of(unknown_self) == (400, "VALIDATION_ERROR")
    assert audit_rows(db_session) == []


def test_unknown_deliverables_are_invalid_references(client: TestClient, world: World, db_session: Session) -> None:
    """Unknown ids give 400 INVALID_REFERENCE naming each unknown end."""
    pm = world.headers("PM")
    api_schema = world.deliverables["API Schema"]
    unknown_predecessor = client.post(
        "/dependencies",
        json={"predecessor_deliverable_id": MISSING_ID, "successor_deliverable_id": api_schema},
        headers=pm,
    )
    assert error_of(unknown_predecessor) == (400, "INVALID_REFERENCE")
    assert fields_of(unknown_predecessor) == {"predecessor_deliverable_id"}
    unknown_successor = client.post(
        "/dependencies",
        json={"predecessor_deliverable_id": api_schema, "successor_deliverable_id": MISSING_ID},
        headers=pm,
    )
    assert fields_of(unknown_successor) == {"successor_deliverable_id"}
    both = client.post(
        "/dependencies",
        json={"predecessor_deliverable_id": MISSING_ID, "successor_deliverable_id": MISSING_ID + 1},
        headers=pm,
    )
    assert error_of(both) == (400, "INVALID_REFERENCE")
    assert fields_of(both) == {"predecessor_deliverable_id", "successor_deliverable_id"}
    assert edge_count(db_session) == SEEDED_EDGES
    assert audit_rows(db_session) == []


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"predecessor_deliverable_id": 0, "successor_deliverable_id": 1}, "predecessor_deliverable_id"),
        ({"predecessor_deliverable_id": "abc", "successor_deliverable_id": 1}, "predecessor_deliverable_id"),
        ({"predecessor_deliverable_id": 1}, "successor_deliverable_id"),
        ({"predecessor_deliverable_id": 1, "successor_deliverable_id": 2, "kind": "FS"}, "kind"),
    ],
)
def test_malformed_bodies_are_validation_errors(
    client: TestClient, world: World, body: dict[str, Any], field: str
) -> None:
    """Bad ids, missing fields and unknown fields give 400 VALIDATION_ERROR."""
    response = client.post("/dependencies", json=body, headers=world.headers("PM"))
    assert error_of(response) == (400, "VALIDATION_ERROR")
    assert field in fields_of(response)


# --- Delete and permissions --------------------------------------------------------------------------


@pytest.mark.parametrize("role", ["ADMIN", "PM"])
def test_delete_dependency(client: TestClient, world: World, db_session: Session, role: str) -> None:
    """ADMIN and PM delete an edge: 204 with no body, one DELETE audit row; a second delete is 404."""
    edge_id = db_session.scalar(
        select(DeliverableDependency.id).where(
            DeliverableDependency.predecessor_deliverable_id == world.deliverables["API Schema"],
            DeliverableDependency.successor_deliverable_id == world.deliverables["Mobile Client Integration"],
        )
    )
    response = client.delete(f"/dependencies/{edge_id}", headers=world.headers(role))
    assert response.status_code == 204 and response.content == b""
    assert edge_count(db_session) == SEEDED_EDGES - 1
    (row,) = audit_rows(db_session)
    assert (row.action, row.entity_id, row.after_state) == ("DELETE", edge_id, None)
    assert (row.before_state["predecessor_title"], row.before_state["successor_title"]) == (
        "API Schema",
        "Mobile Client Integration",
    )
    again = client.delete(f"/dependencies/{edge_id}", headers=world.headers(role))
    assert error_of(again) == (404, "NOT_FOUND")
    assert len(audit_rows(db_session)) == 1


def test_lead_can_create_but_not_delete(client: TestClient, world: World, db_session: Session) -> None:
    """LEAD (Contributor) adds edges; delete gives 403 and the edge stays."""
    lead = world.headers("LEAD")
    created = client.post("/dependencies", json=world.edge("Data Migration Plan", "End-to-End Testing"), headers=lead)
    assert created.status_code == 201, created.text
    denied = client.delete(f"/dependencies/{created.json()['id']}", headers=lead)
    assert error_of(denied) == (403, "ACCESS_DENIED")
    assert edge_count(db_session) == SEEDED_EDGES + 1
    assert [row.action for row in audit_rows(db_session)] == ["CREATE"]


def test_viewer_reads_but_cannot_change_dependencies(client: TestClient, world: World, db_session: Session) -> None:
    """VIEWER lists edges and reads graphs; create and delete give 403."""
    viewer = world.headers("VIEWER")
    assert client.get("/dependencies", headers=viewer).status_code == 200
    assert client.get(f"/projects/{world.projects['Alpha']}/dependency-graph", headers=viewer).status_code == 200
    created = client.post("/dependencies", json=world.edge("Data Migration Plan", "End-to-End Testing"), headers=viewer)
    assert error_of(created) == (403, "ACCESS_DENIED")
    some_edge = db_session.scalar(select(DeliverableDependency.id).limit(1))
    assert error_of(client.delete(f"/dependencies/{some_edge}", headers=viewer)) == (403, "ACCESS_DENIED")
    assert edge_count(db_session) == SEEDED_EDGES
    assert audit_rows(db_session) == []


def test_routes_need_a_token_and_edges_cannot_be_edited(client: TestClient, world: World) -> None:
    """No token gives 401; there is no PUT (or GET by id) on a dependency: 405."""
    alpha = world.projects["Alpha"]
    for method, path in [
        ("GET", "/dependencies"),
        ("POST", "/dependencies"),
        ("DELETE", "/dependencies/1"),
        ("GET", f"/projects/{alpha}/dependency-graph"),
    ]:
        assert error_of(client.request(method, path)) == (401, "UNAUTHENTICATED"), (method, path)
    put = client.put("/dependencies/1", json={"successor_deliverable_id": 2}, headers=world.headers("ADMIN"))
    assert error_of(put) == (405, "METHOD_NOT_ALLOWED")
    assert client.get("/dependencies/1", headers=world.headers("ADMIN")).status_code == 405


# --- Dependency graph -----------------------------------------------------------------------------------


def test_alpha_dependency_graph(client: TestClient, world: World) -> None:
    """Alpha: four levels, roots API Schema and Data Migration Plan, impacted Payments, Mobile and E2E."""
    graph = graph_of(client, world, "Alpha")
    assert set(graph) == GRAPH_KEYS
    assert (graph["project_id"], graph["as_of"]) == (world.projects["Alpha"], T.isoformat())
    assert [set(named(world, level)) for level in graph["levels"]] == [
        {"Requirements Sign-off", "Data Migration Plan"},
        {"API Schema"},
        {"Payments Service Integration", "Mobile Client Integration"},
        {"End-to-End Testing"},
    ]
    assert set(named(world, graph["roots"])) == {"API Schema", "Data Migration Plan"}
    assert [(item["title"], item["depth"], item["caused_by"]) for item in graph["impacted"]] == [
        ("Payments Service Integration", 1, "API Schema"),
        ("Mobile Client Integration", 1, "API Schema"),
        ("End-to-End Testing", 2, "API Schema"),
    ]
    assert all(set(item) == {"id", "title", "depth", "caused_by"} for item in graph["impacted"])

    nodes = {node["title"]: node for node in graph["nodes"]}
    assert set(nodes) == {
        "Requirements Sign-off",
        "API Schema",
        "Payments Service Integration",
        "Mobile Client Integration",
        "End-to-End Testing",
        "Data Migration Plan",
    }
    assert all(set(node) == NODE_KEYS for node in graph["nodes"])
    assert [node["id"] for node in graph["nodes"]] == [node_id for level in graph["levels"] for node_id in level]
    assert {title for title, node in nodes.items() if node["is_root_cause"]} == {"API Schema", "Data Migration Plan"}
    assert {title for title, node in nodes.items() if node["is_impacted"]} == {
        "Payments Service Integration",
        "Mobile Client Integration",
        "End-to-End Testing",
    }
    assert not any(node["is_external"] for node in graph["nodes"])
    assert {title: node["level"] for title, node in nodes.items()} == {
        "Requirements Sign-off": 0,
        "Data Migration Plan": 0,
        "API Schema": 1,
        "Payments Service Integration": 2,
        "Mobile Client Integration": 2,
        "End-to-End Testing": 3,
    }
    assert named(world, nodes["End-to-End Testing"]["predecessor_ids"]) == ["Payments Service Integration"]
    assert nodes["Requirements Sign-off"]["predecessor_ids"] == []
    api = nodes["API Schema"]
    assert (api["status"], api["completion_percentage"], api["assigned_user_name"]) == ("BLOCKED", 40, "Priya Nair")
    assert api["due_date"] == (T - timedelta(days=5)).isoformat()
    edge_titles = {
        tuple(named(world, [edge["predecessor_deliverable_id"], edge["successor_deliverable_id"]]))
        for edge in graph["edges"]
    }
    assert edge_titles == {
        ("Requirements Sign-off", "API Schema"),
        ("API Schema", "Payments Service Integration"),
        ("API Schema", "Mobile Client Integration"),
        ("Payments Service Integration", "End-to-End Testing"),
    }


def test_graph_as_of_defaults_to_today(client: TestClient, world_today: World) -> None:
    """Without as_of the graph is computed for today (UTC)."""
    response = client.get(
        f"/projects/{world_today.projects['Alpha']}/dependency-graph", headers=world_today.headers("LEAD")
    )
    assert response.status_code == 200, response.text
    graph = response.json()
    assert graph["as_of"] == today_utc().isoformat()
    assert set(named(world_today, graph["roots"])) == {"API Schema", "Data Migration Plan"}
    assert len(graph["impacted"]) == 3


def test_graph_as_of_moves_root_causes(client: TestClient, world: World) -> None:
    """Root causes depend on as_of: early on only the BLOCKED item; later every open overdue item."""
    early = graph_of(client, world, "Alpha", as_of=(T - timedelta(days=10)).isoformat())
    assert named(world, early["roots"]) == ["API Schema"]
    assert {item["title"] for item in early["impacted"]} == {
        "Payments Service Integration",
        "Mobile Client Integration",
        "End-to-End Testing",
    }
    late = graph_of(client, world, "Alpha", as_of=(T + timedelta(days=30)).isoformat())
    assert set(named(world, late["roots"])) == {
        "API Schema",
        "Payments Service Integration",
        "Mobile Client Integration",
        "End-to-End Testing",
        "Data Migration Plan",
    }
    assert late["impacted"] == []


def test_graph_includes_directly_linked_deliverables_of_other_projects(client: TestClient, world: World) -> None:
    """A cross-project edge brings the other end in as an external node; nothing further is pulled in."""
    created = client.post(
        "/dependencies", json=world.edge("Campaign Creative", "Mobile Client Integration"), headers=world.headers("PM")
    )
    assert created.status_code == 201, created.text
    alpha = graph_of(client, world, "Alpha")
    nodes = {node["title"]: node for node in alpha["nodes"]}
    assert "Brand Guidelines" not in nodes and "Website Refresh" not in nodes
    external = nodes["Campaign Creative"]
    assert (external["is_external"], external["is_root_cause"], external["level"]) == (True, True, 0)
    assert external["project_id"] == world.projects["Beta"]
    assert external["predecessor_ids"] == []
    assert set(named(world, nodes["Mobile Client Integration"]["predecessor_ids"])) == {
        "API Schema",
        "Campaign Creative",
    }
    assert set(named(world, alpha["roots"])) == {"API Schema", "Data Migration Plan", "Campaign Creative"}
    mobile = next(item for item in alpha["impacted"] if item["title"] == "Mobile Client Integration")
    assert (mobile["depth"], mobile["caused_by"]) == (1, "API Schema")
    assert len(alpha["edges"]) == 5

    beta = graph_of(client, world, "Beta")
    beta_nodes = {node["title"]: node for node in beta["nodes"]}
    assert beta_nodes["Mobile Client Integration"]["is_external"] is True
    assert beta_nodes["Mobile Client Integration"]["is_impacted"] is True
    assert beta_nodes["Mobile Client Integration"]["level"] == 2
    assert "API Schema" not in beta_nodes


def test_graph_errors(client: TestClient, world: World, db_session: Session) -> None:
    """Unknown project 404; bad as_of or id 400; a project without deliverables has an empty graph."""
    viewer = world.headers("VIEWER")
    assert error_of(client.get(f"/projects/{MISSING_ID}/dependency-graph", headers=viewer)) == (404, "NOT_FOUND")
    bad_date = client.get(
        f"/projects/{world.projects['Alpha']}/dependency-graph", params={"as_of": "2026-13-01"}, headers=viewer
    )
    assert error_of(bad_date) == (400, "VALIDATION_ERROR")
    assert error_of(client.get("/projects/0/dependency-graph", headers=viewer)) == (400, "VALIDATION_ERROR")

    department_id = db_session.scalar(select(Department.id).limit(1))
    empty = Project(project_name="Zeta", department_id=department_id, start_date=T, end_date=T + timedelta(days=30))
    db_session.add(empty)
    db_session.commit()
    response = client.get(f"/projects/{empty.id}/dependency-graph", headers=viewer)
    assert response.status_code == 200, response.text
    assert {key: value for key, value in response.json().items() if key not in {"project_id", "as_of"}} == {
        "nodes": [],
        "edges": [],
        "levels": [],
        "roots": [],
        "impacted": [],
    }


# --- Concurrency: the advisory lock --------------------------------------------------------------------

# Sessions waiting for the advisory lock ``pg_advisory_xact_lock(bigint)``: a one-bigint key is reported
# as classid = high 32 bits, objid = low 32 bits, objsubid = 1.
_ADVISORY_WAITERS = text(
    "SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND classid = 0 "
    "AND objid = :key AND objsubid = 1 AND NOT granted"
)


class AdvisoryLockRace:
    """Run dependency creates in threads, each in its own session, while a third session holds lock 74001.

    ``start`` returns once every create is waiting for the lock, which proves that
    they all passed the pre-lock checks at the same time. ``finish`` releases the
    lock, waits for the creates and returns each outcome: ``("created", id)`` or
    ``(error code, message)``.
    """

    def __init__(self, actor_id: int) -> None:
        """Open a separate engine (the app's pool holds only two connections) and take the lock."""
        settings = get_settings()
        self.engine = create_engine(build_url(settings), connect_args=build_connect_args(settings), poolclass=NullPool)
        self.make_session = sessionmaker(bind=self.engine, expire_on_commit=False, autoflush=False)
        self.actor_id = actor_id
        self.pids: dict[str, int] = {}
        self.results: dict[str, tuple[str, str]] = {}
        self.threads: list[threading.Thread] = []
        self.blocker = self.engine.connect()
        self.blocker.execute(select(func.pg_advisory_xact_lock(dependencies_service.ADVISORY_LOCK_KEY)))
        self.finished = False

    def _create(self, name: str, predecessor_id: int, successor_id: int) -> None:
        """Call the service like the API does, recording the outcome under ``name``."""
        session = self.make_session()
        try:
            self.pids[name] = session.scalar(text("SELECT pg_backend_pid()"))
            actor = session.get(User, self.actor_id)
            data = DependencyCreate(predecessor_deliverable_id=predecessor_id, successor_deliverable_id=successor_id)
            created = dependencies_service.create_dependency(session, actor=actor, data=data)
            self.results[name] = ("created", str(created.id))
        except AppError as exc:
            self.results[name] = (exc.error, exc.message)
        except Exception as exc:  # noqa: BLE001 - surfaced by the test's assertions
            self.results[name] = ("exception", repr(exc))
        finally:
            session.close()

    def start(self, creates: dict[str, tuple[int, int]]) -> None:
        """Start one thread per create and wait until all of them are blocked on the advisory lock."""
        for name, (predecessor_id, successor_id) in creates.items():
            thread = threading.Thread(target=self._create, args=(name, predecessor_id, successor_id))
            thread.start()
            self.threads.append(thread)
        waiting: set[int] = set()
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            with self.engine.connect() as probe:
                waiting = set(probe.scalars(_ADVISORY_WAITERS, {"key": dependencies_service.ADVISORY_LOCK_KEY}))
            if len(self.pids) == len(creates) and set(self.pids.values()) <= waiting:
                break
            time.sleep(0.05)
        all_waiting = len(self.pids) == len(creates) and set(self.pids.values()) <= waiting
        assert all_waiting, (self.pids, waiting, self.results)
        assert self.results == {}, "every create must still be waiting for the lock"

    def finish(self) -> dict[str, tuple[str, str]]:
        """Release the lock (once), wait for the creates and return their outcomes."""
        if not self.finished:
            self.finished = True
            self.blocker.rollback()
            self.blocker.close()
            for thread in self.threads:
                thread.join(timeout=30)
            self.engine.dispose()
        return self.results


@pytest.fixture
def race(world: World) -> Iterator[AdvisoryLockRace]:
    """An advisory-lock race acting as the PM; the lock is always released, even when a test fails."""
    harness = AdvisoryLockRace(world.user_ids["Vikram Shah"])
    try:
        yield harness
    finally:
        harness.finish()


def edge_pairs(db: Session) -> set[tuple[int, int]]:
    """Every edge as (predecessor id, successor id), read fresh from the database."""
    return {
        (row.predecessor_deliverable_id, row.successor_deliverable_id)
        for row in db.execute(
            select(DeliverableDependency.predecessor_deliverable_id, DeliverableDependency.successor_deliverable_id)
        )
    }


def test_concurrent_opposite_edges_cannot_both_succeed(
    world: World, db_session: Session, race: AdvisoryLockRace
) -> None:
    """Two sessions add A -> B and B -> A at the same time: the advisory lock lets exactly one win.

    Both creates pass the pre-lock checks (neither edge exists yet) and wait at
    ``pg_advisory_xact_lock(74001)``. Once it is released, the first to get the
    lock inserts its edge; the second sees that edge under the lock and is
    rejected as a cycle, so the database never holds A -> B -> A.
    """
    a, b = world.deliverables["Data Migration Plan"], world.deliverables["Mobile Client Integration"]
    race.start({"a_to_b": (a, b), "b_to_a": (b, a)})
    results = race.finish()

    assert sorted(kind for kind, _ in results.values()) == ["DEPENDENCY_CYCLE", "created"], results
    winner = next(name for name, (kind, _) in results.items() if kind == "created")
    _, message = next(result for result in results.values() if result[0] == "DEPENDENCY_CYCLE")
    first, second = ("Data Migration Plan", "Mobile Client Integration")
    if winner == "a_to_b":
        assert message.endswith(f"{first} → {second} → {first}")
    else:
        assert message.endswith(f"{second} → {first} → {second}")
    pairs = edge_pairs(db_session)
    assert ((a, b) in pairs) != ((b, a) in pairs)
    assert edge_count(db_session) == SEEDED_EDGES + 1
    assert [row.action for row in audit_rows(db_session)] == ["CREATE"]


def test_concurrent_identical_edges_give_one_conflict(
    world: World, db_session: Session, race: AdvisoryLockRace
) -> None:
    """The same new edge sent twice at once: one is created, the other is a 409 found under the lock."""
    a, b = world.deliverables["Data Migration Plan"], world.deliverables["End-to-End Testing"]
    race.start({"first": (a, b), "second": (a, b)})
    results = race.finish()
    assert sorted(kind for kind, _ in results.values()) == ["CONFLICT", "created"], results
    assert edge_count(db_session) == SEEDED_EDGES + 1
    assert [row.action for row in audit_rows(db_session)] == ["CREATE"]


def test_deliverable_deleted_while_waiting_for_the_lock(
    world: World, db_session: Session, race: AdvisoryLockRace
) -> None:
    """A successor deleted by another transaction while the create waits gives 400 INVALID_REFERENCE."""
    a, b = world.deliverables["Data Migration Plan"], world.deliverables["Mobile Client Integration"]
    race.start({"edge": (a, b)})
    with race.make_session() as other:
        other.execute(delete(Deliverable).where(Deliverable.id == b))
        other.commit()
    results = race.finish()
    assert results == {
        "edge": ("INVALID_REFERENCE", "One of the deliverables was deleted while the dependency was being added.")
    }
    assert all(b not in pair for pair in edge_pairs(db_session))
    assert edge_count(db_session) == SEEDED_EDGES - 1
    assert audit_rows(db_session) == []
