"""Analytics endpoints: response shapes, role access, filters, dashboard counts and recent activity.

The database holds the spec section 10 demo data seeded at a fixed day ``T``,
and requests pass ``as_of`` explicitly (except where the default is under
test), so the results do not depend on the day the tests run.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, event, select
from sqlalchemy.orm import Session

from app.db.models import AuditLog, Deliverable, Department, Project, ResourceAllocation, User
from app.db.seed import seed_portfolio
from app.services import analytics as analytics_service
from conftest import TEST_PASSWORD

T = date(2026, 11, 25)
ROLES = ("ADMIN", "PM", "LEAD", "VIEWER")
ANALYTICS_PATHS = ("/analytics/dashboard", "/analytics/capacity", "/analytics/budget", "/analytics/risk")

# Exact response shapes (CONTRACT section 4 and spec section 9.4).
DASHBOARD_KEYS = {
    "as_of", "total_projects", "projects_by_status", "risk_by_level", "budget", "departments",
    "over_allocated_count", "top_risks", "recent_activity",
}
DASHBOARD_BUDGET_KEYS = {"planned_total", "spent_total", "remaining_total", "utilization_pct"}
DASHBOARD_DEPARTMENT_KEYS = {"department_id", "department_name", "planned_budget", "actual_spend"}
TOP_RISK_KEYS = {"project_id", "project_name", "risk_score", "risk_level", "headline"}
AUDIT_EVENT_KEYS = {
    "id", "actor_id", "actor_email", "entity_type", "entity_id", "action", "before_state", "after_state", "created_at",
}
CAPACITY_KEYS = {"as_of", "employees", "over_allocated_count"}
EMPLOYEE_KEYS = {
    "user_id", "user_name", "department_id", "peak_load", "current_load", "status", "segments", "conflicts",
    "is_compound_bottleneck", "bottleneck_deliverables",
}
SEGMENT_KEYS = {"start_date", "end_date", "load", "allocation_ids"}
CONFLICT_KEYS = {"start_date", "end_date", "load", "allocations"}
CONFLICT_ALLOCATION_KEYS = {
    "id", "project_id", "project_name", "deliverable_id", "deliverable_title", "allocation_percentage",
    "start_date", "end_date",
}
BOTTLENECK_KEYS = {"id", "title", "project_id"}
BUDGET_KEYS = {"as_of", "projects", "departments", "totals"}
BUDGET_PROJECT_KEYS = {
    "project_id", "project_name", "department_id", "department_name", "status", "planned_budget", "actual_spend",
    "remaining", "utilization_pct", "completion_pct", "divergence_pp",
}
BUDGET_DEPARTMENT_KEYS = {
    "department_id", "department_name", "planned_budget", "actual_spend", "remaining", "utilization_pct",
    "completion_pct",
}
BUDGET_TOTALS_KEYS = {"planned_budget", "actual_spend", "remaining", "utilization_pct"}
RISK_LIST_KEYS = {"as_of", "items"}
RISK_ITEM_KEYS = {
    "project_id", "project_name", "department_name", "status", "risk_score", "risk_level", "factors", "headline",
}
FACTOR_KEYS = {"key", "label", "points", "max_points", "detail"}
FACTOR_ORDER = ["schedule", "blocked", "blast_radius", "resource", "budget", "deadline"]
PROJECT_RISK_KEYS = {
    "project_id", "project_name", "risk_score", "risk_level", "as_of", "factors", "evidence",
    "impacted_deliverables", "recommended_actions",
}
IMPACTED_KEYS = {"id", "title", "depth", "caused_by"}


def day(offset: int) -> str:
    """Return the ISO date ``offset`` days from ``T``."""
    return (T + timedelta(days=offset)).isoformat()


def short_name(project_name: str) -> str:
    """Return the spec's short project name: 'Project Alpha: ...' -> 'Alpha'."""
    return project_name.split(":")[0].removeprefix("Project ")


@dataclass(frozen=True)
class Seed:
    """Ids of the seeded rows, looked up by the names the spec tables use."""

    departments: dict[str, int]
    users: dict[str, int]
    projects: dict[str, int]
    deliverables: dict[str, int]
    allocations: dict[tuple[str, str], int]


@pytest.fixture
def seeded(db_session: Session) -> Seed:
    """Seed the spec section 10 portfolio at ``T``, commit it and return the ids by name."""
    seed_portfolio(db_session, TEST_PASSWORD, today=T)
    db_session.commit()
    projects = {short_name(name): pid for pid, name in db_session.execute(select(Project.id, Project.project_name))}
    project_keys = {pid: key for key, pid in projects.items()}
    users = dict((name, uid) for uid, name in db_session.execute(select(User.id, User.name)))
    user_names = {uid: name for name, uid in users.items()}
    return Seed(
        departments={name: did for did, name in db_session.execute(select(Department.id, Department.name))},
        users=users,
        projects=projects,
        deliverables={title: did for did, title in db_session.execute(select(Deliverable.id, Deliverable.title))},
        allocations={
            (user_names[user_id], project_keys[project_id]): allocation_id
            for allocation_id, user_id, project_id in db_session.execute(
                select(ResourceAllocation.id, ResourceAllocation.user_id, ResourceAllocation.project_id)
            )
        },
    )


@pytest.fixture
def viewer(auth_headers: Callable[..., dict[str, str]]) -> dict[str, str]:
    """Headers for a VIEWER, the least privileged role (every role may read analytics)."""
    return auth_headers("VIEWER")


def get_json(client: TestClient, path: str, headers: dict[str, str], **params: Any) -> Any:
    """GET ``path`` with query ``params``, require 200 and return the JSON body."""
    response = client.get(path, headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def by_name(employees: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Index capacity employees by name."""
    return {employee["user_name"]: employee for employee in employees}


def segments(employee: dict[str, Any]) -> list[tuple[str, str, int]]:
    """Return an employee's segments as ``(start, end, load)`` tuples."""
    return [(item["start_date"], item["end_date"], item["load"]) for item in employee["segments"]]


def assert_error(response: Any, status: int, error: str) -> dict[str, Any]:
    """Check the standard error shape, status and code; return the body."""
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error", "message", "details"}
    assert body["error"] == error
    return body


# --- Access --------------------------------------------------------------------------------------------


@pytest.mark.parametrize("role", ROLES)
def test_every_role_can_read_every_analytics_endpoint(
    client: TestClient, seeded: Seed, auth_headers: Callable[..., dict[str, str]], role: str
) -> None:
    headers = auth_headers(role)
    for path in (*ANALYTICS_PATHS, f"/projects/{seeded.projects['Alpha']}/risk"):
        response = client.get(path, headers=headers, params={"as_of": T.isoformat()})
        assert response.status_code == 200, (path, response.text)
        assert response.json()["as_of"] == T.isoformat()


@pytest.mark.parametrize("path", [*ANALYTICS_PATHS, "/projects/1/risk"])
@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer not-a-token"}], ids=["no-token", "bad-token"])
def test_analytics_need_a_valid_access_token(client: TestClient, path: str, headers: dict[str, str]) -> None:
    response = client.get(path, headers=headers)
    assert_error(response, 401, "UNAUTHENTICATED")
    assert response.headers["www-authenticate"] == "Bearer"


def test_auth_is_checked_before_query_validation(client: TestClient) -> None:
    response = client.get("/analytics/capacity", params={"from": "2026-12-01", "to": "2026-11-01"})
    assert_error(response, 401, "UNAUTHENTICATED")


# --- Dashboard -----------------------------------------------------------------------------------------


def test_dashboard_shape_and_counts_on_the_seed(
    client: TestClient, seeded: Seed, auth_headers: Callable[..., dict[str, str]]
) -> None:
    body = get_json(client, "/analytics/dashboard", auth_headers("PM"), as_of=T.isoformat())
    assert set(body) == DASHBOARD_KEYS
    assert body["as_of"] == T.isoformat()
    assert body["total_projects"] == 5
    assert body["projects_by_status"] == {"PLANNED": 0, "ACTIVE": 4, "ON_HOLD": 0, "COMPLETED": 1, "CANCELLED": 0}
    assert list(body["risk_by_level"]) == ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    assert body["risk_by_level"] == {"LOW": 2, "MEDIUM": 1, "HIGH": 1, "CRITICAL": 1}
    assert body["budget"] == {
        "planned_total": "1080000.00",
        "spent_total": "828500.00",
        "remaining_total": "251500.00",
        "utilization_pct": 76.7,
    }
    assert all(set(item) == DASHBOARD_DEPARTMENT_KEYS for item in body["departments"])
    assert [(d["department_name"], d["planned_budget"], d["actual_spend"]) for d in body["departments"]] == [
        ("Engineering", "400000.00", "300000.00"),
        ("Finance", "250000.00", "137500.00"),
        ("Human Resources", "80000.00", "76000.00"),
        ("Marketing", "150000.00", "105000.00"),
        ("Operations", "200000.00", "210000.00"),
    ]
    assert body["departments"][0]["department_id"] == seeded.departments["Engineering"]
    assert body["over_allocated_count"] == 1
    assert all(set(item) == TOP_RISK_KEYS for item in body["top_risks"])
    assert [(item["project_id"], item["risk_score"], item["risk_level"]) for item in body["top_risks"]] == [
        (seeded.projects["Alpha"], 78, "CRITICAL"),
        (seeded.projects["Delta"], 61, "HIGH"),
        (seeded.projects["Beta"], 31, "MEDIUM"),
    ]
    detail = get_json(client, f"/projects/{seeded.projects['Alpha']}/risk", auth_headers("PM"), as_of=T.isoformat())
    assert body["top_risks"][0]["headline"] == detail["evidence"][0]
    assert body["top_risks"][0]["project_name"] == "Project Alpha: Customer Payments Platform"
    assert body["recent_activity"] == []  # the seed writes no audit rows


def test_dashboard_top_risks_lists_at_most_five_scoring_projects(
    client: TestClient, seeded: Seed, db_session: Session, viewer: dict[str, str]
) -> None:
    # Four more ACTIVE projects, each with one overdue deliverable: 8 points each (schedule only).
    for letter in "DCBA":
        project = Project(
            project_name=f"Extra {letter}", department_id=seeded.departments["Engineering"], status="ACTIVE",
            start_date=T - timedelta(days=10), end_date=T + timedelta(days=200), planned_budget=Decimal("0"),
        )
        db_session.add(project)
        db_session.flush()
        db_session.add(Deliverable(project_id=project.id, title=f"Late {letter}", due_date=T - timedelta(days=1),
                                   status="IN_PROGRESS", completion_percentage=0))
    db_session.commit()

    body = get_json(client, "/analytics/dashboard", viewer, as_of=T.isoformat())
    assert [(item["project_name"].split(":")[0], item["risk_score"]) for item in body["top_risks"]] == [
        ("Project Alpha", 78), ("Project Delta", 61), ("Project Beta", 31), ("Extra A", 8), ("Extra B", 8),
    ]
    assert body["total_projects"] == 9
    assert body["risk_by_level"] == {"LOW": 6, "MEDIUM": 1, "HIGH": 1, "CRITICAL": 1}


def _add_audit_events(session: Session, actor_id: int) -> None:
    """Insert 12 audit events; the last two share a timestamp, so the id breaks the tie."""
    base = datetime(2026, 11, 25, 9, 0, tzinfo=timezone.utc)

    def event_row(index: int) -> AuditLog:
        return AuditLog(
            actor_id=actor_id, actor_email="admin@acme.example", entity_type="project", entity_id=index,
            action="UPDATE", before_state={"step": index}, after_state={"step": index + 1},
            created_at=base + timedelta(minutes=min(index, 10)),
        )

    session.add_all([event_row(index) for index in range(11)])
    session.flush()
    session.add(event_row(11))  # flushed later, so it gets the higher id
    session.commit()


@pytest.mark.parametrize("role, sees_activity", [("ADMIN", True), ("PM", True), ("LEAD", False), ("VIEWER", False)])
def test_recent_activity_is_filled_only_for_admin_and_pm(
    client: TestClient,
    seeded: Seed,
    db_session: Session,
    auth_headers: Callable[..., dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
    role: str,
    sees_activity: bool,
) -> None:
    _add_audit_events(db_session, seeded.users["Asha Rao"])
    queried = Counter()
    real_recent_activity = analytics_service.recent_activity

    def counting_recent_activity(db: Session, *args: Any, **kwargs: Any) -> list[AuditLog]:
        queried["audit"] += 1
        return real_recent_activity(db, *args, **kwargs)

    monkeypatch.setattr(analytics_service, "recent_activity", counting_recent_activity)
    body = get_json(client, "/analytics/dashboard", auth_headers(role), as_of=T.isoformat())

    if not sees_activity:
        assert body["recent_activity"] == []
        assert queried["audit"] == 0  # the audit log is not even read for LEAD and VIEWER
        return
    activity = body["recent_activity"]
    assert len(activity) == 10
    assert all(set(item) == AUDIT_EVENT_KEYS for item in activity)
    assert [item["entity_id"] for item in activity] == [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]  # newest first
    first = activity[0]
    assert first["action"] == "UPDATE"
    assert first["entity_type"] == "project"
    assert first["actor_id"] == seeded.users["Asha Rao"]
    assert first["actor_email"] == "admin@acme.example"
    assert first["before_state"] == {"step": 11}
    assert first["after_state"] == {"step": 12}
    assert datetime.fromisoformat(first["created_at"]) == datetime(2026, 11, 25, 9, 10, tzinfo=timezone.utc)


# --- Capacity ------------------------------------------------------------------------------------------


def test_capacity_shape_and_seed_values(client: TestClient, seeded: Seed, viewer: dict[str, str]) -> None:
    body = get_json(client, "/analytics/capacity", viewer, as_of=T.isoformat())
    assert set(body) == CAPACITY_KEYS
    assert body["as_of"] == T.isoformat()
    assert body["over_allocated_count"] == 1
    employees = body["employees"]
    assert [item["user_name"] for item in employees] == [
        "Arjun Mehta", "Kabir Sethi", "Priya Nair", "Rohan Das", "Sana Khan",
    ]
    for employee in employees:
        assert set(employee) == EMPLOYEE_KEYS
        assert all(set(segment) == SEGMENT_KEYS for segment in employee["segments"])

    priya = by_name(employees)["Priya Nair"]
    assert priya["user_id"] == seeded.users["Priya Nair"]
    assert priya["department_id"] == seeded.departments["Engineering"]
    assert (priya["peak_load"], priya["current_load"], priya["status"]) == (120, 120, "OVER_ALLOCATED")
    assert segments(priya) == [(day(-10), day(-3), 60), (day(-2), day(12), 120), (day(13), day(20), 60),
                               (day(40), day(70), 50)]
    alpha_allocation = seeded.allocations[("Priya Nair", "Alpha")]
    beta_allocation = seeded.allocations[("Priya Nair", "Beta")]
    assert priya["segments"][1]["allocation_ids"] == sorted([alpha_allocation, beta_allocation])
    [conflict] = priya["conflicts"]
    assert set(conflict) == CONFLICT_KEYS
    assert (conflict["start_date"], conflict["end_date"], conflict["load"]) == (day(-2), day(12), 120)
    assert all(set(item) == CONFLICT_ALLOCATION_KEYS for item in conflict["allocations"])
    assert conflict["allocations"] == sorted(
        [
            {
                "id": alpha_allocation, "project_id": seeded.projects["Alpha"],
                "project_name": "Project Alpha: Customer Payments Platform",
                "deliverable_id": seeded.deliverables["API Schema"], "deliverable_title": "API Schema",
                "allocation_percentage": 60, "start_date": day(-10), "end_date": day(20),
            },
            {
                "id": beta_allocation, "project_id": seeded.projects["Beta"],
                "project_name": "Project Beta: Brand Relaunch Campaign",
                "deliverable_id": None, "deliverable_title": None,
                "allocation_percentage": 60, "start_date": day(-2), "end_date": day(12),
            },
        ],
        key=lambda item: item["id"],
    )
    assert priya["is_compound_bottleneck"] is True
    assert priya["bottleneck_deliverables"] == [
        {"id": seeded.deliverables["API Schema"], "title": "API Schema", "project_id": seeded.projects["Alpha"]}
    ]

    arjun = by_name(employees)["Arjun Mehta"]
    assert segments(arjun) == [(day(-20), day(9), 60), (day(10), day(40), 60)]
    assert (arjun["peak_load"], arjun["status"], arjun["conflicts"]) == (60, "AVAILABLE", [])
    assert arjun["is_compound_bottleneck"] is False
    assert arjun["bottleneck_deliverables"] == []
    # Rohan owns root-cause and impacted work but has no conflict: not a bottleneck.
    rohan = by_name(employees)["Rohan Das"]
    assert (rohan["peak_load"], rohan["status"], rohan["is_compound_bottleneck"]) == (80, "AVAILABLE", False)


@pytest.mark.parametrize(
    "department, expected_people, expected_over",
    [
        ("Engineering", ["Arjun Mehta", "Priya Nair", "Rohan Das"], 1),
        ("Finance", ["Kabir Sethi"], 0),
        ("Operations", ["Sana Khan"], 0),
        ("Marketing", [], 0),
    ],
)
def test_capacity_department_filter(
    client: TestClient, seeded: Seed, viewer: dict[str, str], department: str, expected_people: list[str],
    expected_over: int,
) -> None:
    body = get_json(
        client, "/analytics/capacity", viewer, as_of=T.isoformat(), department_id=seeded.departments[department]
    )
    assert [item["user_name"] for item in body["employees"]] == expected_people
    assert all(item["department_id"] == seeded.departments[department] for item in body["employees"])
    assert body["over_allocated_count"] == expected_over


def test_capacity_unknown_department_is_an_empty_list(client: TestClient, seeded: Seed, viewer: dict[str, str]) -> None:
    body = get_json(client, "/analytics/capacity", viewer, as_of=T.isoformat(), department_id=999999)
    assert body == {"as_of": T.isoformat(), "employees": [], "over_allocated_count": 0}


def test_capacity_window_clips_segments_and_conflicts(client: TestClient, seeded: Seed, viewer: dict[str, str]) -> None:
    body = get_json(client, "/analytics/capacity", viewer, **{"as_of": T.isoformat(), "from": day(0), "to": day(5)})
    people = by_name(body["employees"])
    assert {name: segments(item) for name, item in people.items()} == {
        "Arjun Mehta": [(day(0), day(5), 60)],
        "Kabir Sethi": [(day(0), day(5), 50)],
        "Priya Nair": [(day(0), day(5), 120)],
        "Rohan Das": [(day(0), day(5), 80)],
        "Sana Khan": [(day(0), day(5), 70)],
    }
    priya = people["Priya Nair"]
    [conflict] = priya["conflicts"]
    assert (conflict["start_date"], conflict["end_date"], conflict["load"]) == (day(0), day(5), 120)
    # The contributing allocations keep their own full dates.
    assert [(item["start_date"], item["end_date"]) for item in conflict["allocations"]] == [
        (day(-10), day(20)), (day(-2), day(12)),
    ]
    assert (priya["peak_load"], priya["status"], priya["is_compound_bottleneck"]) == (120, "OVER_ALLOCATED", True)
    assert body["over_allocated_count"] == 1


def test_capacity_window_after_the_conflict_shows_no_conflict(
    client: TestClient, seeded: Seed, viewer: dict[str, str]
) -> None:
    body = get_json(client, "/analytics/capacity", viewer, **{"as_of": T.isoformat(), "from": day(13), "to": day(30)})
    people = by_name(body["employees"])
    assert {name: segments(item) for name, item in people.items()} == {
        "Arjun Mehta": [(day(13), day(30), 60)],
        "Kabir Sethi": [(day(13), day(30), 50)],
        "Priya Nair": [(day(13), day(20), 60)],
        "Rohan Das": [(day(13), day(25), 80)],
        "Sana Khan": [(day(13), day(20), 70)],
    }
    priya = people["Priya Nair"]
    # Every figure is computed inside the window: no conflict there, so not over-allocated or a bottleneck.
    assert (priya["peak_load"], priya["current_load"], priya["status"]) == (60, 0, "AVAILABLE")
    assert priya["conflicts"] == []
    assert (priya["is_compound_bottleneck"], priya["bottleneck_deliverables"]) == (False, [])
    assert body["over_allocated_count"] == 0


def test_capacity_window_in_the_past_has_no_current_conflict(
    client: TestClient, seeded: Seed, viewer: dict[str, str]
) -> None:
    body = get_json(client, "/analytics/capacity", viewer, **{"as_of": T.isoformat(), "from": day(-5), "to": day(-1)})
    priya = by_name(body["employees"])["Priya Nair"]
    assert segments(priya) == [(day(-5), day(-3), 60), (day(-2), day(-1), 120)]
    assert [(c["start_date"], c["end_date"], c["load"]) for c in priya["conflicts"]] == [(day(-2), day(-1), 120)]
    # The conflict inside the window ended before as_of, so it is not current.
    assert (priya["peak_load"], priya["status"], priya["is_compound_bottleneck"]) == (120, "AVAILABLE", False)
    assert body["over_allocated_count"] == 0


@pytest.mark.parametrize(
    "params, expected",
    [
        ({"from": day(41)}, {"Kabir Sethi": [(day(41), day(90), 50)], "Priya Nair": [(day(41), day(70), 50)]}),
        (
            {"to": day(-11)},
            {
                "Arjun Mehta": [(day(-20), day(-11), 60)],
                "Kabir Sethi": [(day(-40), day(-11), 50)],
                "Rohan Das": [(day(-30), day(-11), 80)],
                "Sana Khan": [(day(-30), day(-11), 70)],
            },
        ),
        (
            {"from": day(0), "to": day(0)},
            {
                "Arjun Mehta": [(day(0), day(0), 60)],
                "Kabir Sethi": [(day(0), day(0), 50)],
                "Priya Nair": [(day(0), day(0), 120)],
                "Rohan Das": [(day(0), day(0), 80)],
                "Sana Khan": [(day(0), day(0), 70)],
            },
        ),
        ({"from": "9999-12-31"}, {}),
    ],
    ids=["from-only", "to-only", "single-day", "nothing-in-window"],
)
def test_capacity_open_and_single_day_windows(
    client: TestClient, seeded: Seed, viewer: dict[str, str], params: dict[str, str], expected: dict[str, Any]
) -> None:
    body = get_json(client, "/analytics/capacity", viewer, as_of=T.isoformat(), **params)
    assert {item["user_name"]: segments(item) for item in body["employees"]} == expected


def test_capacity_widest_window_equals_no_window(client: TestClient, seeded: Seed, viewer: dict[str, str]) -> None:
    unfiltered = get_json(client, "/analytics/capacity", viewer, as_of=T.isoformat())
    widest = get_json(
        client, "/analytics/capacity", viewer, **{"as_of": T.isoformat(), "from": "0001-01-01", "to": "9999-12-31"}
    )
    assert widest == unfiltered


def test_capacity_window_and_department_combine(client: TestClient, seeded: Seed, viewer: dict[str, str]) -> None:
    params = {"as_of": T.isoformat(), "from": day(41), "department_id": seeded.departments["Engineering"]}
    body = get_json(client, "/analytics/capacity", viewer, **params)
    assert [item["user_name"] for item in body["employees"]] == ["Priya Nair"]


@pytest.mark.parametrize(
    "params, field",
    [
        ({"from": "2026-12-01", "to": "2026-11-30"}, "from"),
        ({"from": "0"}, "from"),
        ({"to": "2026-13-01"}, "to"),
        ({"from": "2026-1-5"}, "from"),
        ({"to": "tomorrow"}, "to"),
        ({"department_id": "0"}, "department_id"),
        ({"department_id": "abc"}, "department_id"),
    ],
)
def test_capacity_bad_filters_are_400(
    client: TestClient, viewer: dict[str, str], params: dict[str, str], field: str
) -> None:
    body = assert_error(client.get("/analytics/capacity", headers=viewer, params=params), 400, "VALIDATION_ERROR")
    assert [detail["field"] for detail in body["details"]] == [field]


def test_capacity_from_after_to_explains_the_window(client: TestClient, viewer: dict[str, str]) -> None:
    response = client.get("/analytics/capacity", headers=viewer, params={"from": "2026-12-01", "to": "2026-11-30"})
    body = assert_error(response, 400, "VALIDATION_ERROR")
    assert "'from' must be on or before 'to'" in body["message"]
    assert body["details"] == [{"field": "from", "issue": "2026-12-01 is after 'to' (2026-11-30)."}]


# --- Budget --------------------------------------------------------------------------------------------


def test_budget_shape_and_seed_values(client: TestClient, seeded: Seed, viewer: dict[str, str]) -> None:
    body = get_json(client, "/analytics/budget", viewer, as_of=T.isoformat())
    assert set(body) == BUDGET_KEYS
    assert body["as_of"] == T.isoformat()
    assert all(set(item) == BUDGET_PROJECT_KEYS for item in body["projects"])
    assert all(set(item) == BUDGET_DEPARTMENT_KEYS for item in body["departments"])
    assert set(body["totals"]) == BUDGET_TOTALS_KEYS

    rows = [
        (short_name(p["project_name"]), p["department_name"], p["status"], p["planned_budget"], p["actual_spend"],
         p["remaining"], p["utilization_pct"], p["completion_pct"], p["divergence_pp"])
        for p in body["projects"]
    ]
    assert rows == [
        ("Alpha", "Engineering", "ACTIVE", "400000.00", "300000.00", "100000.00", 75.0, 35.0, 40.0),
        ("Beta", "Marketing", "ACTIVE", "150000.00", "105000.00", "45000.00", 70.0, 50.0, 20.0),
        ("Gamma", "Finance", "ACTIVE", "250000.00", "137500.00", "112500.00", 55.0, 60.0, -5.0),
        ("Delta", "Operations", "ACTIVE", "200000.00", "210000.00", "-10000.00", 105.0, 55.0, 50.0),
        ("Epsilon", "Human Resources", "COMPLETED", "80000.00", "76000.00", "4000.00", 95.0, 100.0, -5.0),
    ]
    assert [p["project_id"] for p in body["projects"]] == [seeded.projects[key] for key in
                                                           ("Alpha", "Beta", "Gamma", "Delta", "Epsilon")]
    assert body["projects"][0]["department_id"] == seeded.departments["Engineering"]
    departments = [
        (d["department_name"], d["planned_budget"], d["actual_spend"], d["remaining"], d["utilization_pct"],
         d["completion_pct"])
        for d in body["departments"]
    ]
    assert departments == [
        ("Engineering", "400000.00", "300000.00", "100000.00", 75.0, 35.0),
        ("Finance", "250000.00", "137500.00", "112500.00", 55.0, 60.0),
        ("Human Resources", "80000.00", "76000.00", "4000.00", 95.0, 100.0),
        ("Marketing", "150000.00", "105000.00", "45000.00", 70.0, 50.0),
        ("Operations", "200000.00", "210000.00", "-10000.00", 105.0, 55.0),
    ]
    assert body["totals"] == {
        "planned_budget": "1080000.00", "actual_spend": "828500.00", "remaining": "251500.00",
        "utilization_pct": 76.7,
    }


def test_budget_zero_planned_budget_gives_null_percentages(
    client: TestClient, seeded: Seed, db_session: Session, viewer: dict[str, str]
) -> None:
    research = Department(name="Research")
    db_session.add(research)
    db_session.flush()
    db_session.add(Project(project_name="Unfunded Study", department_id=research.id, status="PLANNED",
                           start_date=T, end_date=T + timedelta(days=100), planned_budget=Decimal("0")))
    db_session.commit()

    body = get_json(client, "/analytics/budget", viewer, as_of=T.isoformat())
    project = next(item for item in body["projects"] if item["project_name"] == "Unfunded Study")
    assert (project["planned_budget"], project["actual_spend"], project["remaining"]) == ("0.00", "0.00", "0.00")
    assert (project["utilization_pct"], project["completion_pct"], project["divergence_pp"]) == (None, 0.0, None)
    department = next(item for item in body["departments"] if item["department_name"] == "Research")
    assert (department["utilization_pct"], department["completion_pct"]) == (None, 0.0)
    assert body["totals"]["utilization_pct"] == 76.7


# --- Risk ----------------------------------------------------------------------------------------------


def test_risk_ranking_shape_and_order(client: TestClient, seeded: Seed, viewer: dict[str, str]) -> None:
    body = get_json(client, "/analytics/risk", viewer, as_of=T.isoformat())
    assert set(body) == RISK_LIST_KEYS
    assert body["as_of"] == T.isoformat()
    items = body["items"]
    assert all(set(item) == RISK_ITEM_KEYS for item in items)
    assert [(short_name(i["project_name"]), i["risk_score"], i["risk_level"]) for i in items] == [
        ("Alpha", 78, "CRITICAL"), ("Delta", 61, "HIGH"), ("Beta", 31, "MEDIUM"), ("Epsilon", 0, "LOW"),
        ("Gamma", 0, "LOW"),
    ]
    alpha = items[0]
    assert (alpha["project_id"], alpha["department_name"], alpha["status"]) == (
        seeded.projects["Alpha"], "Engineering", "ACTIVE",
    )
    for item in items:
        assert [factor["key"] for factor in item["factors"]] == FACTOR_ORDER
        assert all(set(factor) == FACTOR_KEYS for factor in item["factors"])
        assert sum(factor["points"] for factor in item["factors"]) == item["risk_score"]
        detail = get_json(client, f"/projects/{item['project_id']}/risk", viewer, as_of=T.isoformat())
        assert item["headline"] == detail["evidence"][0]
        assert item["factors"] == detail["factors"]


def test_project_risk_has_exactly_the_spec_shape(client: TestClient, seeded: Seed, viewer: dict[str, str]) -> None:
    body = get_json(client, f"/projects/{seeded.projects['Alpha']}/risk", viewer, as_of=T.isoformat())
    assert set(body) == PROJECT_RISK_KEYS
    assert (body["project_id"], body["project_name"]) == (
        seeded.projects["Alpha"], "Project Alpha: Customer Payments Platform",
    )
    assert (body["risk_score"], body["risk_level"], body["as_of"]) == (78, "CRITICAL", T.isoformat())
    assert all(set(factor) == FACTOR_KEYS for factor in body["factors"])
    assert [(f["key"], f["label"], f["max_points"]) for f in body["factors"]] == [
        ("schedule", "Schedule", 20),
        ("blocked", "Blocked deliverables", 15),
        ("blast_radius", "Dependency blast radius", 20),
        ("resource", "Resource over-allocation", 15),
        ("budget", "Budget vs progress", 20),
        ("deadline", "Deadline proximity", 10),
    ]
    assert body["factors"][0]["detail"] == "2 overdue deliverables"
    assert all(set(item) == IMPACTED_KEYS for item in body["impacted_deliverables"])
    assert body["impacted_deliverables"] == [
        {"id": seeded.deliverables["Payments Service Integration"], "title": "Payments Service Integration",
         "depth": 1, "caused_by": "API Schema"},
        {"id": seeded.deliverables["Mobile Client Integration"], "title": "Mobile Client Integration",
         "depth": 1, "caused_by": "API Schema"},
        {"id": seeded.deliverables["End-to-End Testing"], "title": "End-to-End Testing",
         "depth": 2, "caused_by": "API Schema"},
    ]
    # The spec section 9.4 example lines, built from the same numbers as the points.
    assert "75.0% of the planned budget is consumed while deliverables are 35.0% complete." in body["evidence"]
    assert "Deliverable 'API Schema' is BLOCKED and holds up 3 downstream deliverables." in body["evidence"]
    assert "Priya Nair is at 120% concurrent allocation from 2026-11-23 to 2026-12-07." in body["evidence"]
    assert any(
        action.startswith(
            "Escalate the blocker on 'API Schema' (owner: Priya Nair); it holds up 3 downstream deliverables."
        )
        for action in body["recommended_actions"]
    )
    assert all(isinstance(line, str) and line for line in body["evidence"] + body["recommended_actions"])


def test_completed_project_is_not_scored(client: TestClient, seeded: Seed, viewer: dict[str, str]) -> None:
    body = get_json(client, f"/projects/{seeded.projects['Epsilon']}/risk", viewer, as_of=T.isoformat())
    assert (body["risk_score"], body["risk_level"]) == (0, "LOW")
    assert [factor["points"] for factor in body["factors"]] == [0] * 6
    assert len(body["evidence"]) == 1 and "COMPLETED" in body["evidence"][0]
    assert body["impacted_deliverables"] == []
    assert body["recommended_actions"] == []


def test_project_risk_unknown_project_is_404(client: TestClient, seeded: Seed, viewer: dict[str, str]) -> None:
    body = assert_error(client.get("/projects/999999/risk", headers=viewer), 404, "NOT_FOUND")
    assert body["message"] == "Project 999999 was not found."


def test_project_risk_on_an_empty_database_is_404(client: TestClient, viewer: dict[str, str]) -> None:
    assert_error(client.get("/projects/1/risk", headers=viewer), 404, "NOT_FOUND")


@pytest.mark.parametrize("project_id", ["0", "-1", "abc", str(2**63)])
def test_project_risk_bad_id_is_400(client: TestClient, viewer: dict[str, str], project_id: str) -> None:
    body = assert_error(client.get(f"/projects/{project_id}/risk", headers=viewer), 400, "VALIDATION_ERROR")
    assert body["details"][0]["field"] == "project_id"


def test_risk_is_computed_on_read(
    client: TestClient, seeded: Seed, db_session: Session, viewer: dict[str, str]
) -> None:
    gamma = f"/projects/{seeded.projects['Gamma']}/risk"
    assert get_json(client, gamma, viewer, as_of=T.isoformat())["risk_score"] == 0
    # Block a Gamma deliverable: the next read scores it, nothing is stored or cached.
    rules_engine = db_session.get(Deliverable, seeded.deliverables["Reconciliation Rules Engine"])
    rules_engine.status = "BLOCKED"
    rules_engine.blocked_reason = "Waiting for the bank's test credentials"
    db_session.commit()
    body = get_json(client, gamma, viewer, as_of=T.isoformat())
    points = {factor["key"]: factor["points"] for factor in body["factors"]}
    # 10 for the blocked item, 5 each for Bank Feed Integration and Month-End Close Pilot downstream.
    assert (points["blocked"], points["blast_radius"], body["risk_score"]) == (10, 10, 20)


# --- as_of ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize("path", [*ANALYTICS_PATHS, "/projects/1/risk"])
def test_as_of_defaults_to_today_utc(
    client: TestClient, seeded: Seed, viewer: dict[str, str], monkeypatch: pytest.MonkeyPatch, path: str
) -> None:
    monkeypatch.setattr("app.api.analytics.today_utc", lambda: T + timedelta(days=1))
    body = get_json(client, path, viewer)
    assert body["as_of"] == day(1)


def test_default_as_of_is_the_real_utc_date(client: TestClient, viewer: dict[str, str]) -> None:
    before = datetime.now(timezone.utc).date()
    body = get_json(client, "/analytics/risk", viewer)
    assert body["as_of"] in {before.isoformat(), datetime.now(timezone.utc).date().isoformat()}


@pytest.mark.parametrize("path", [*ANALYTICS_PATHS, "/projects/1/risk"])
@pytest.mark.parametrize("value", ["0", "1700000000", "2026-02-30", "2026-1-5", "2026-11-25T00:00:00", "today", ""])
def test_bad_as_of_is_400(client: TestClient, viewer: dict[str, str], path: str, value: str) -> None:
    body = assert_error(client.get(path, headers=viewer, params={"as_of": value}), 400, "VALIDATION_ERROR")
    assert [detail["field"] for detail in body["details"]] == ["as_of"]


@pytest.mark.parametrize("as_of", ["0001-01-01", "9999-12-31"])
def test_extreme_as_of_dates_are_handled(client: TestClient, seeded: Seed, viewer: dict[str, str], as_of: str) -> None:
    for path in (*ANALYTICS_PATHS, f"/projects/{seeded.projects['Alpha']}/risk"):
        assert get_json(client, path, viewer, as_of=as_of)["as_of"] == as_of


# --- One analysis per request ----------------------------------------------------------------------------


REQUESTS = [
    ("/analytics/dashboard", {}),
    ("/analytics/capacity", {}),
    ("/analytics/capacity", {"from": "2026-11-20", "to": "2026-12-31", "department_id": "1"}),
    ("/analytics/budget", {}),
    ("/analytics/risk", {}),
    ("/projects/1/risk", {}),
]


def test_each_request_loads_and_analyzes_the_portfolio_once(
    client: TestClient, seeded: Seed, auth_headers: Callable[..., dict[str, str]], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: Counter[str] = Counter()
    real_load, real_analyze = analytics_service.load_snapshot, analytics_service.analyze_portfolio

    def counting_load(session: Session) -> Any:
        calls["load_snapshot"] += 1
        return real_load(session)

    def counting_analyze(snapshot: Any, as_of: date) -> Any:
        calls["analyze_portfolio"] += 1
        return real_analyze(snapshot, as_of)

    monkeypatch.setattr(analytics_service, "load_snapshot", counting_load)
    monkeypatch.setattr(analytics_service, "analyze_portfolio", counting_analyze)
    headers = auth_headers("ADMIN")
    for path, params in REQUESTS:
        calls.clear()
        get_json(client, path, headers, as_of=T.isoformat(), **params)
        assert calls == {"load_snapshot": 1, "analyze_portfolio": 1}, path


@pytest.fixture
def statement_count(engine: Engine) -> Iterator[Callable[[], int]]:
    """Count SQL statements sent through the shared engine from now on."""
    statements: list[str] = []

    def record(conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)

    def count() -> int:
        total = len(statements)
        statements.clear()
        return total

    yield count
    event.remove(engine, "before_cursor_execute", record)


def test_query_count_does_not_grow_with_the_portfolio(
    client: TestClient,
    seeded: Seed,
    db_session: Session,
    auth_headers: Callable[..., dict[str, str]],
    statement_count: Callable[[], int],
) -> None:
    headers = auth_headers("PM")

    def counts() -> list[int]:
        result = []
        for path, params in REQUESTS:
            statement_count()
            get_json(client, path, headers, as_of=T.isoformat(), **params)
            result.append(statement_count())
        return result

    before = counts()
    for index in range(3):
        project = Project(project_name=f"Growth {index}", department_id=seeded.departments["Finance"],
                          status="ACTIVE", start_date=T, end_date=T + timedelta(days=60),
                          planned_budget=Decimal("1000.00"))
        db_session.add(project)
        db_session.flush()
        db_session.add(Deliverable(project_id=project.id, title=f"Growth item {index}", due_date=T - timedelta(days=2),
                                   status="BLOCKED", completion_percentage=10))
        db_session.add(ResourceAllocation(user_id=seeded.users["Kabir Sethi"], project_id=project.id,
                                          allocation_percentage=40, start_date=T, end_date=T + timedelta(days=5)))
    db_session.commit()
    after = counts()
    assert after == before
    # The user lookup, the five snapshot queries and, for the PM dashboard, one audit-log query.
    assert before == [7, 6, 6, 6, 6, 6]


# --- Empty portfolio ---------------------------------------------------------------------------------------


def test_empty_portfolio(client: TestClient, viewer: dict[str, str]) -> None:
    dashboard = get_json(client, "/analytics/dashboard", viewer, as_of=T.isoformat())
    assert dashboard["total_projects"] == 0
    assert set(dashboard["projects_by_status"].values()) == {0}
    assert dashboard["risk_by_level"] == {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    assert dashboard["budget"] == {
        "planned_total": "0.00", "spent_total": "0.00", "remaining_total": "0.00", "utilization_pct": None,
    }
    assert (dashboard["departments"], dashboard["top_risks"], dashboard["over_allocated_count"]) == ([], [], 0)
    assert get_json(client, "/analytics/capacity", viewer, as_of=T.isoformat()) == {
        "as_of": T.isoformat(), "employees": [], "over_allocated_count": 0,
    }
    assert get_json(client, "/analytics/budget", viewer, as_of=T.isoformat()) == {
        "as_of": T.isoformat(), "projects": [], "departments": [],
        "totals": {"planned_budget": "0.00", "actual_spend": "0.00", "remaining": "0.00", "utilization_pct": None},
    }
    assert get_json(client, "/analytics/risk", viewer, as_of=T.isoformat()) == {"as_of": T.isoformat(), "items": []}
