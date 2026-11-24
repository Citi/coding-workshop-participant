"""Golden results of spec section 10, asserted through the HTTP API on a database seeded at a fixed day ``T``.

The demo data is inserted by ``app.db.seed.seed_portfolio`` exactly as the
``seed`` task does, a demo user signs in through ``POST /auth/login``, and every
request passes ``as_of``. The spec places no seed offset within a day of a rule
boundary, so every golden value is checked at ``T`` and again at ``T + 1``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AuditLog, Deliverable, DeliverableDependency, Project
from app.db.seed import seed_portfolio
from app.engines.dependency import find_cycle_path
from app.services.portfolio import load_snapshot
from conftest import TEST_PASSWORD

T = date(2026, 11, 25)
AS_OF_OFFSETS = pytest.mark.parametrize("offset", [0, 1], ids=["T", "T+1"])

FACTOR_KEYS = ("schedule", "blocked", "blast_radius", "resource", "budget", "deadline")

# Spec section 10 "Golden results": the six factor points (in FACTOR_KEYS order), score, level,
# completion % and utilization %. Epsilon is COMPLETED, so it is not scored: every factor is 0.
GOLDEN: dict[str, tuple[tuple[int, ...], int, str, float, float]] = {
    "Alpha": ((16, 10, 15, 12, 15, 10), 78, "CRITICAL", 35.0, 75.0),
    "Beta": ((8, 0, 10, 8, 5, 0), 31, "MEDIUM", 50.0, 70.0),
    "Gamma": ((0, 0, 0, 0, 0, 0), 0, "LOW", 60.0, 55.0),
    "Delta": ((16, 10, 5, 0, 20, 10), 61, "HIGH", 55.0, 105.0),
    "Epsilon": ((0, 0, 0, 0, 0, 0), 0, "LOW", 100.0, 95.0),
}

ALPHA_IMPACTED = {
    "Payments Service Integration": (1, "API Schema"),
    "Mobile Client Integration": (1, "API Schema"),
    "End-to-End Testing": (2, "API Schema"),
}

CYCLE_TITLES = ["API Schema", "Payments Service Integration", "End-to-End Testing", "API Schema"]
CYCLE_TEXT = "API Schema → Payments Service Integration → End-to-End Testing → API Schema"


def day(offset: int) -> str:
    """Return the ISO date ``offset`` days from ``T``."""
    return (T + timedelta(days=offset)).isoformat()


@dataclass(frozen=True)
class Seeded:
    """Ids of the seeded projects (by short name) and deliverables (by title)."""

    projects: dict[str, int]
    deliverables: dict[str, int]


@pytest.fixture
def seeded(db_session: Session) -> Seeded:
    """Seed the spec section 10 portfolio at ``T`` and commit it, like ``./bin/db-task.sh local seed``."""
    counts = seed_portfolio(db_session, TEST_PASSWORD, today=T)
    db_session.commit()
    assert counts["projects"] == 5 and counts["deliverable_dependencies"] == 14
    projects = {
        name.split(":")[0].removeprefix("Project "): project_id
        for project_id, name in db_session.execute(select(Project.id, Project.project_name))
    }
    deliverables = {title: item_id for item_id, title in db_session.execute(select(Deliverable.id, Deliverable.title))}
    return Seeded(projects=projects, deliverables=deliverables)


@pytest.fixture
def pm_headers(client: TestClient, seeded: Seeded) -> dict[str, str]:
    """Sign in as the demo PM through the API and return the Authorization header."""
    response = client.post("/auth/login", json={"email": "pm@acme.example", "password": TEST_PASSWORD})
    assert response.status_code == 200, response.text
    assert response.json()["user"]["role"] == "PM"
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def get_json(client: TestClient, path: str, headers: dict[str, str], as_of: str) -> Any:
    """GET ``path`` as of a date, require 200 and return the JSON body."""
    response = client.get(path, headers=headers, params={"as_of": as_of})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["as_of"] == as_of
    return body


def employee(client: TestClient, headers: dict[str, str], as_of: str, name: str) -> dict[str, Any]:
    """Return one person's entry from ``GET /analytics/capacity``."""
    employees = get_json(client, "/analytics/capacity", headers, as_of)["employees"]
    matches = [item for item in employees if item["user_name"] == name]
    assert len(matches) == 1, [item["user_name"] for item in employees]
    return matches[0]


@AS_OF_OFFSETS
@pytest.mark.parametrize("project", list(GOLDEN))
def test_golden_row(client: TestClient, seeded: Seeded, pm_headers: dict[str, str], project: str, offset: int) -> None:
    points, score, level, completion, utilization = GOLDEN[project]
    as_of = day(offset)
    project_id = seeded.projects[project]

    detail = get_json(client, f"/projects/{project_id}/risk", pm_headers, as_of)
    assert {factor["key"]: factor["points"] for factor in detail["factors"]} == dict(zip(FACTOR_KEYS, points))
    assert (detail["risk_score"], detail["risk_level"]) == (score, level)

    ranking = get_json(client, "/analytics/risk", pm_headers, as_of)
    [summary] = [item for item in ranking["items"] if item["project_id"] == project_id]
    assert (summary["risk_score"], summary["risk_level"]) == (score, level)
    assert [factor["points"] for factor in summary["factors"]] == list(points)

    budget = get_json(client, "/analytics/budget", pm_headers, as_of)
    [row] = [item for item in budget["projects"] if item["project_id"] == project_id]
    assert (row["completion_pct"], row["utilization_pct"]) == (completion, utilization)


@AS_OF_OFFSETS
def test_risk_ranking_matches_the_golden_table(
    client: TestClient, seeded: Seeded, pm_headers: dict[str, str], offset: int
) -> None:
    ranking = get_json(client, "/analytics/risk", pm_headers, day(offset))
    assert [(item["project_id"], item["risk_score"], item["risk_level"]) for item in ranking["items"]] == [
        (seeded.projects["Alpha"], 78, "CRITICAL"),
        (seeded.projects["Delta"], 61, "HIGH"),
        (seeded.projects["Beta"], 31, "MEDIUM"),
        (seeded.projects["Epsilon"], 0, "LOW"),
        (seeded.projects["Gamma"], 0, "LOW"),
    ]


@AS_OF_OFFSETS
def test_alpha_impacted_set_is_exactly_the_three_downstream_items(
    client: TestClient, seeded: Seeded, pm_headers: dict[str, str], offset: int
) -> None:
    detail = get_json(client, f"/projects/{seeded.projects['Alpha']}/risk", pm_headers, day(offset))
    impacted = {item["title"]: (item["depth"], item["caused_by"]) for item in detail["impacted_deliverables"]}
    assert impacted == ALPHA_IMPACTED
    assert {item["id"] for item in detail["impacted_deliverables"]} == {
        seeded.deliverables[title] for title in ALPHA_IMPACTED
    }


@AS_OF_OFFSETS
def test_priya_nair_has_four_segments_peaking_at_120(
    client: TestClient, seeded: Seeded, pm_headers: dict[str, str], offset: int
) -> None:
    priya = employee(client, pm_headers, day(offset), "Priya Nair")
    assert [(item["start_date"], item["end_date"], item["load"]) for item in priya["segments"]] == [
        (day(-10), day(-3), 60),
        (day(-2), day(12), 120),
        (day(13), day(20), 60),
        (day(40), day(70), 50),
    ]
    assert priya["peak_load"] == 120
    assert priya["status"] == "OVER_ALLOCATED"
    assert [(item["start_date"], item["end_date"], item["load"]) for item in priya["conflicts"]] == [
        (day(-2), day(12), 120)
    ]


@AS_OF_OFFSETS
def test_arjun_mehta_peaks_at_60_with_no_conflicts(
    client: TestClient, seeded: Seeded, pm_headers: dict[str, str], offset: int
) -> None:
    arjun = employee(client, pm_headers, day(offset), "Arjun Mehta")
    assert arjun["peak_load"] == 60
    assert arjun["conflicts"] == []
    assert arjun["status"] != "OVER_ALLOCATED"
    assert arjun["is_compound_bottleneck"] is False


def test_cycle_path_from_the_loaded_snapshot(db_session: Session, seeded: Seeded) -> None:
    snapshot = load_snapshot(db_session)
    titles = {item.id: item.title for item in snapshot.deliverables}
    path = find_cycle_path(
        snapshot.dependencies, seeded.deliverables["End-to-End Testing"], seeded.deliverables["API Schema"]
    )
    assert path is not None
    assert [titles[item_id] for item_id in path] == CYCLE_TITLES
    assert " → ".join(titles[item_id] for item_id in path) == CYCLE_TEXT


def test_adding_end_to_end_testing_before_api_schema_is_rejected_with_the_path(
    client: TestClient, seeded: Seeded, pm_headers: dict[str, str], db_session: Session
) -> None:
    def counts() -> tuple[int, int]:
        edges = db_session.scalar(select(func.count()).select_from(DeliverableDependency))
        audits = db_session.scalar(select(func.count()).select_from(AuditLog))
        return edges, audits

    before = counts()
    response = client.post(
        "/dependencies",
        headers=pm_headers,
        json={
            "predecessor_deliverable_id": seeded.deliverables["End-to-End Testing"],
            "successor_deliverable_id": seeded.deliverables["API Schema"],
        },
    )
    if response.status_code == 404 and response.json().get("message") == "Route not found.":
        pytest.fail("POST /dependencies does not exist yet (owned by the deliverables/dependencies router).")
    assert response.status_code == 400, response.text
    body = response.json()
    assert body["error"] == "DEPENDENCY_CYCLE"
    assert CYCLE_TEXT in body["message"]
    assert counts() == before  # no edge and no audit row was written
