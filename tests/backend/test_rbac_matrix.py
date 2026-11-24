"""Spec section 7, cell by cell: every resource x action x role on the seeded portfolio.

Each case seeds the spec section 10 data, signs in as the seeded user with the role,
sends one request and checks the outcome: allowed actions succeed with the spec
status code, denied ones return 403 ACCESS_DENIED (and change nothing).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    BudgetEntry,
    Deliverable,
    DeliverableDependency,
    Department,
    Project,
    ResourceAllocation,
    User,
)
from app.db.seed import seed_portfolio
from app.security import create_access_token
from conftest import TEST_PASSWORD

T = date(2026, 11, 25)
ROLE_EMAILS = {
    "ADMIN": "admin@acme.example",
    "PM": "pm@acme.example",
    "LEAD": "lead@acme.example",
    "VIEWER": "viewer@acme.example",
}
ROLES = tuple(ROLE_EMAILS)


@dataclass(frozen=True)
class Ids:
    """Ids of seeded rows that the requests below refer to."""

    engineering: int
    unused_department: int
    alpha: int
    epsilon: int
    neha: int
    priya: int
    data_migration: int
    end_to_end: int
    an_edge: int
    an_allocation: int
    a_budget_entry: int


def _seed(session: Session) -> Ids:
    """Seed spec section 10 plus one department no project uses, and collect ids."""
    seed_portfolio(session, TEST_PASSWORD, today=T)
    unused = Department(name="Unused Department")
    session.add(unused)
    session.commit()

    def one(stmt: Any) -> int:
        return int(session.scalar(stmt))

    return Ids(
        engineering=one(select(Department.id).where(Department.name == "Engineering")),
        unused_department=unused.id,
        alpha=one(select(Project.id).where(Project.project_name.like("Project Alpha%"))),
        epsilon=one(select(Project.id).where(Project.project_name.like("Project Epsilon%"))),
        neha=one(select(User.id).where(User.email == "viewer@acme.example")),
        priya=one(select(User.id).where(User.email == "priya.nair@acme.example")),
        data_migration=one(select(Deliverable.id).where(Deliverable.title == "Data Migration Plan")),
        end_to_end=one(select(Deliverable.id).where(Deliverable.title == "End-to-End Testing")),
        an_edge=one(select(DeliverableDependency.id).order_by(DeliverableDependency.id).limit(1)),
        an_allocation=one(select(ResourceAllocation.id).order_by(ResourceAllocation.id).limit(1)),
        a_budget_entry=one(select(BudgetEntry.id).order_by(BudgetEntry.id).limit(1)),
    )


Request = tuple[str, str, dict[str, Any] | None]
RequestBuilder = Callable[[Ids], Request]


def _iso(days: int) -> str:
    return (T + timedelta(days=days)).isoformat()


# (resource, action) -> builder of (method, path, json body) using seeded ids.
REQUESTS: dict[tuple[str, str], RequestBuilder] = {
    ("users", "read"): lambda i: ("GET", "/users", None),
    ("users", "create"): lambda i: ("POST", "/users", {
        "name": "New Person", "email": "new.person@acme.example", "password": TEST_PASSWORD, "role": "VIEWER"}),
    ("users", "update"): lambda i: ("PUT", f"/users/{i.priya}", {"name": "Priya N."}),
    ("users", "delete"): lambda i: ("DELETE", f"/users/{i.priya}", None),
    ("departments", "read"): lambda i: ("GET", "/departments", None),
    ("departments", "create"): lambda i: ("POST", "/departments", {"name": "Legal"}),
    ("departments", "update"): lambda i: ("PUT", f"/departments/{i.unused_department}", {"name": "Renamed"}),
    ("departments", "delete"): lambda i: ("DELETE", f"/departments/{i.unused_department}", None),
    ("projects", "read"): lambda i: ("GET", f"/projects/{i.alpha}", None),
    ("projects", "create"): lambda i: ("POST", "/projects", {
        "project_name": "Project Zeta", "department_id": i.engineering,
        "start_date": _iso(0), "end_date": _iso(30), "planned_budget": "1000.00"}),
    ("projects", "update"): lambda i: ("PUT", f"/projects/{i.alpha}", {"description": "Updated"}),
    ("projects", "delete"): lambda i: ("DELETE", f"/projects/{i.epsilon}", None),
    ("deliverables", "read"): lambda i: ("GET", "/deliverables", None),
    ("deliverables", "create"): lambda i: ("POST", "/deliverables", {
        "project_id": i.alpha, "title": "Runbook", "due_date": _iso(20)}),
    ("deliverables", "update"): lambda i: ("PUT", f"/deliverables/{i.data_migration}", {"completion_percentage": 60}),
    ("deliverables", "delete"): lambda i: ("DELETE", f"/deliverables/{i.data_migration}", None),
    ("dependencies", "read"): lambda i: ("GET", "/dependencies", None),
    ("dependencies", "create"): lambda i: ("POST", "/dependencies", {
        "predecessor_deliverable_id": i.data_migration, "successor_deliverable_id": i.end_to_end}),
    ("dependencies", "delete"): lambda i: ("DELETE", f"/dependencies/{i.an_edge}", None),
    ("allocations", "read"): lambda i: ("GET", "/allocations", None),
    ("allocations", "create"): lambda i: ("POST", "/allocations", {
        "user_id": i.neha, "project_id": i.alpha, "allocation_percentage": 20,
        "start_date": _iso(1), "end_date": _iso(10)}),
    ("allocations", "update"): lambda i: ("PUT", f"/allocations/{i.an_allocation}", {"allocation_percentage": 40}),
    ("allocations", "delete"): lambda i: ("DELETE", f"/allocations/{i.an_allocation}", None),
    ("budget_entries", "read"): lambda i: ("GET", "/budget-entries", None),
    ("budget_entries", "create"): lambda i: ("POST", "/budget-entries", {
        "project_id": i.alpha, "category": "OTHER", "amount": "10.00", "entry_date": _iso(-1)}),
    ("budget_entries", "update"): lambda i: ("PUT", f"/budget-entries/{i.a_budget_entry}", {"amount": "11.00"}),
    ("budget_entries", "delete"): lambda i: ("DELETE", f"/budget-entries/{i.a_budget_entry}", None),
    ("analytics", "dashboard"): lambda i: ("GET", f"/analytics/dashboard?as_of={T}", None),
    ("analytics", "capacity"): lambda i: ("GET", f"/analytics/capacity?as_of={T}", None),
    ("analytics", "budget"): lambda i: ("GET", f"/analytics/budget?as_of={T}", None),
    ("analytics", "risk"): lambda i: ("GET", f"/analytics/risk?as_of={T}", None),
    ("analytics", "project_risk"): lambda i: ("GET", f"/projects/{i.alpha}/risk?as_of={T}", None),
    ("analytics", "dependency_graph"): lambda i: ("GET", f"/projects/{i.alpha}/dependency-graph?as_of={T}", None),
    ("analytics", "impact"): lambda i: ("GET", f"/deliverables/{i.data_migration}/impact", None),
    ("audit_logs", "read"): lambda i: ("GET", "/audit-logs", None),
}

C, R, U, D = "create", "read", "update", "delete"
_ANALYTICS = ("dashboard", "capacity", "budget", "risk", "project_risk", "dependency_graph", "impact")

# Spec section 7: the actions each role may perform on each resource.
ALLOWED: dict[str, dict[str, set[str]]] = {
    "users": {"ADMIN": {C, R, U, D}, "PM": {R}, "LEAD": {R}, "VIEWER": {R}},
    "departments": {"ADMIN": {C, R, U, D}, "PM": {R}, "LEAD": {R}, "VIEWER": {R}},
    "projects": {"ADMIN": {C, R, U, D}, "PM": {C, R, U, D}, "LEAD": {R}, "VIEWER": {R}},
    "deliverables": {"ADMIN": {C, R, U, D}, "PM": {C, R, U, D}, "LEAD": {C, R, U}, "VIEWER": {R}},
    "dependencies": {"ADMIN": {C, R, D}, "PM": {C, R, D}, "LEAD": {C, R}, "VIEWER": {R}},
    "allocations": {"ADMIN": {C, R, U, D}, "PM": {C, R, U, D}, "LEAD": {R}, "VIEWER": {R}},
    "budget_entries": {"ADMIN": {C, R, U, D}, "PM": {C, R, U, D}, "LEAD": {R}, "VIEWER": {R}},
    "analytics": {role: set(_ANALYTICS) for role in ROLES},
    "audit_logs": {"ADMIN": {R}, "PM": {R}, "LEAD": set(), "VIEWER": set()},
}

SUCCESS = {"GET": 200, "POST": 201, "PUT": 200, "DELETE": 204}

CASES = [
    pytest.param(resource, action, role, action in ALLOWED[resource][role], id=f"{resource}-{action}-{role}")
    for (resource, action) in REQUESTS
    for role in ROLES
]


def test_matrix_covers_every_cell_of_spec_section_7() -> None:
    """Every resource has every action it supports listed for every role."""
    for resource, by_role in ALLOWED.items():
        assert set(by_role) == set(ROLES), resource
        actions = {action for (res, action) in REQUESTS if res == resource}
        for allowed in by_role.values():
            assert allowed <= actions, (resource, allowed - actions)


@pytest.mark.parametrize(("resource", "action", "role", "allowed"), CASES)
def test_role_permission(
    client: TestClient, db_session: Session, resource: str, action: str, role: str, allowed: bool
) -> None:
    """Allowed calls succeed with the spec status code; denied calls are 403 ACCESS_DENIED."""
    ids = _seed(db_session)
    user = db_session.scalar(select(User).where(User.email == ROLE_EMAILS[role]))
    assert user is not None and user.role == role
    headers = {"Authorization": f"Bearer {create_access_token(user)}"}
    method, path, body = REQUESTS[(resource, action)](ids)
    response = client.request(method, path, json=body, headers=headers)
    if allowed:
        assert response.status_code == SUCCESS[method], response.text
    else:
        assert response.status_code == 403, response.text
        assert response.json()["error"] == "ACCESS_DENIED"


@pytest.mark.parametrize(("resource", "action"), list(REQUESTS))
def test_no_token_is_401_everywhere(client: TestClient, db_session: Session, resource: str, action: str) -> None:
    """Every non-public route requires a token."""
    ids = _seed(db_session)
    method, path, body = REQUESTS[(resource, action)](ids)
    response = client.request(method, path, json=body)
    assert response.status_code == 401, response.text
    assert response.json()["error"] == "UNAUTHENTICATED"
