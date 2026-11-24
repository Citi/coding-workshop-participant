"""Golden results of spec section 10, asserted through the HTTP API on a database seeded at a fixed day ``T``.

The demo data is inserted by ``app.db.seed.seed_portfolio`` exactly as the
``seed`` task does, a demo user signs in through ``POST /auth/login``, and every
request passes ``as_of``. The spec places no seed offset within a day of a rule
boundary, so every golden value is checked at ``T`` and again at ``T + 1``.

The last section runs the end-to-end smoke test (``tests/e2e/smoke_test.py``)
in-process: its HTTP calls are answered by the TestClient, on data seeded
today, because the smoke test relies on the server's default ``as_of``.
"""

from __future__ import annotations

import importlib.util
import secrets
import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import today_utc
from app.db.models import ALL_TABLES, AuditLog, Deliverable, DeliverableDependency, Project
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
    return seed_and_index(db_session, T)


def seed_and_index(db_session: Session, anchor: date) -> Seeded:
    """Seed the spec section 10 portfolio at ``anchor``, commit it and return the ids by name."""
    counts = seed_portfolio(db_session, TEST_PASSWORD, today=anchor)
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


# --- The end-to-end smoke test, run in-process ----------------------------------------------------------

SMOKE_TEST_PATH = Path(__file__).resolve().parents[1] / "e2e" / "smoke_test.py"
LOGIN_401 = "POST /auth/login -> HTTP 401 UNAUTHENTICATED: Invalid email or password."

# Changes a request's token or body before it is sent: (method, path, token, body) -> (token, body).
Tamper = Callable[[str, str, str | None, dict[str, Any] | None], tuple[str | None, dict[str, Any] | None]]


@pytest.fixture(scope="module")
def smoke() -> ModuleType:
    """Import the smoke test script (``tests/e2e`` is not a package)."""
    spec = importlib.util.spec_from_file_location("e2e_smoke_test", SMOKE_TEST_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses look their module up while the file runs
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def seeded_today(db_session: Session) -> Seeded:
    """Seed the demo data at today's UTC date, as ``./bin/db-task.sh local seed`` does."""
    return seed_and_index(db_session, today_utc())


class InProcessApi:
    """Stands in for the smoke test's ``Api``: the same calls, answered by the TestClient.

    ``tamper`` may change a request before it is sent, to make the app accept
    a write that it should refuse.
    """

    def __init__(self, client: TestClient, smoke: ModuleType, tamper: Tamper | None = None) -> None:
        """Answer calls with ``client`` and wrap them in the smoke test's ``HttpResult``."""
        self.client, self.smoke, self.tamper = client, smoke, tamper

    def call(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        body: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
    ) -> Any:
        """Send one request through the TestClient, like ``smoke_test.Api.call``."""
        if self.tamper is not None:
            token, body = self.tamper(method, path, token, body)
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        response = self.client.request(method, path, headers=headers, json=body, params=query)
        content_type = response.headers.get("content-type", "")
        return self.smoke.HttpResult(method, path, response.status_code, content_type, response.content)


def run_smoke_main(
    smoke: ModuleType, api: InProcessApi, password: str, monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> tuple[int, str]:
    """Run ``smoke_test.main()`` with its HTTP calls sent to ``api``; return the exit code and the output."""
    monkeypatch.setenv("BASE_URL", "http://testserver/api/portfolio")
    monkeypatch.setenv("SEED_PASSWORD", password)
    monkeypatch.setattr(smoke, "Api", lambda base_url: api)
    code = smoke.main()
    return code, capsys.readouterr().out


def database_state(session: Session) -> dict[str, Any]:
    """Row count and a hash of every row of every table, plus each identity sequence's last value."""
    state: dict[str, Any] = {
        table: tuple(
            session.execute(
                text(f"SELECT count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) FROM {table} t")
            ).one()
        )
        for table in ALL_TABLES
    }
    sequences = text("SELECT sequencename, last_value FROM pg_sequences WHERE schemaname = current_schema()")
    state["sequences"] = {name: last_value for name, last_value in session.execute(sequences)}
    return state


def audit_trail(session: Session) -> list[tuple[str, int | None, str]]:
    """Every audit row as ``(entity_type, entity_id, action)``, oldest first."""
    rows = session.execute(select(AuditLog.entity_type, AuditLog.entity_id, AuditLog.action).order_by(AuditLog.id))
    return [tuple(row) for row in rows]


def count_rows(session: Session, model: type) -> int:
    """Return the number of rows of ``model``'s table."""
    return session.scalar(select(func.count()).select_from(model))


def test_smoke_test_passes_in_process_and_changes_nothing(
    client: TestClient, seeded_today: Seeded, db_session: Session, smoke: ModuleType,
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str],
) -> None:
    before = database_state(db_session)
    code, out = run_smoke_main(smoke, InProcessApi(client, smoke), TEST_PASSWORD, monkeypatch, capsys)
    assert code == 0, out
    assert [line[:7] for line in out.splitlines() if line.startswith(("PASS", "FAIL"))] == [
        f"PASS  {number}" for number in range(1, 9)
    ]
    assert out.rstrip().endswith("8/8 steps passed")
    assert "score 78 CRITICAL, utilization 75.0%, completion 35.0%" in out
    assert f"HTTP 400 DEPENDENCY_CYCLE: This dependency would create a cycle: {CYCLE_TEXT}" in out
    assert "Priya Nair: peak 120%, status OVER_ALLOCATED" in out
    assert "outcome: 404 JSON NOT_FOUND (Project 999999 was not found.)" in out
    assert TEST_PASSWORD not in out
    # Nothing was written: every row, every count and every identity sequence is as it was.
    assert database_state(db_session) == before


def test_smoke_test_with_a_wrong_password_explains_the_login_failure(
    client: TestClient, seeded_today: Seeded, smoke: ModuleType, monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    wrong_password = secrets.token_urlsafe(12)
    code, out = run_smoke_main(smoke, InProcessApi(client, smoke), wrong_password, monkeypatch, capsys)
    assert code == 1
    assert out.rstrip().endswith("1/8 steps passed, 7 failed")
    assert "PASS  1. /health is healthy" in out
    # Steps 2 and 7 sign in; each failure carries the 401 and the SEED_PASSWORD hint.
    assert out.count(LOGIN_401) == 2
    assert out.count("hint: SEED_PASSWORD must be the password given to the seed or reset task") == 2
    for line in smoke.LOGIN_HINT.splitlines():
        assert out.count(line) == 2
    assert out.count("not run: no PM token (step 2 failed)") == 4  # steps 3 to 6
    assert "not run: no access token (steps 2 and 7 failed)" in out
    assert wrong_password not in out


@pytest.mark.parametrize("pm_signed_in", [True, False], ids=["pm-token", "no-pm-token"])
def test_smoke_step_7_deletes_a_wrongly_accepted_project_and_says_so(
    client: TestClient, seeded_today: Seeded, db_session: Session, smoke: ModuleType, pm_signed_in: bool
) -> None:
    api = InProcessApi(client, smoke)
    pm_token, _ = smoke.login(api, "pm@acme.example", TEST_PASSWORD, "PM")

    def as_pm(method: str, path: str, token: str | None, body: Any) -> tuple[str | None, Any]:
        """Simulate broken RBAC: the viewer's POST /projects goes out with the PM's token and is accepted."""
        return (pm_token if (method, path) == ("POST", "/projects") else token), body

    api.tamper = as_pm
    ctx = smoke.Context(password=TEST_PASSWORD, pm_token=pm_token if pm_signed_in else None)
    new_id = max(seeded_today.projects.values()) + 1

    with pytest.raises(smoke.StepFailed) as failure:
        smoke.step_viewer_denied(api, ctx)

    message = str(failure.value)
    assert f"the VIEWER created a project (HTTP 201, id {new_id}); " in message
    if pm_signed_in:
        assert message.endswith(
            f"deleted it again as PM (DELETE /projects/{new_id} -> HTTP 204); its CREATE and DELETE audit rows remain"
        )
        assert count_rows(db_session, Project) == 5
        assert audit_trail(db_session) == [("project", new_id, "CREATE"), ("project", new_id, "DELETE")]
    else:
        assert message.endswith(f"NOT deleted: there is no PM token (step 2 failed); delete /projects/{new_id} by hand")
        assert count_rows(db_session, Project) == 6
        assert audit_trail(db_session) == [("project", new_id, "CREATE")]


def test_smoke_step_5_deletes_a_wrongly_accepted_edge_and_says_so(
    client: TestClient, seeded_today: Seeded, db_session: Session, smoke: ModuleType
) -> None:
    api = InProcessApi(client, smoke)
    ctx = smoke.Context(password=TEST_PASSWORD, alpha_id=seeded_today.projects["Alpha"])
    ctx.pm_token, _ = smoke.login(api, "pm@acme.example", TEST_PASSWORD, "PM")
    harmless = {
        "predecessor_deliverable_id": seeded_today.deliverables["Data Migration Plan"],
        "successor_deliverable_id": seeded_today.deliverables["End-to-End Testing"],
    }

    def swap_edge(method: str, path: str, token: str | None, body: Any) -> tuple[str | None, Any]:
        """Simulate a broken cycle check: the cycle is swapped for an edge the app accepts."""
        return token, (harmless if (method, path) == ("POST", "/dependencies") else body)

    api.tamper = swap_edge

    with pytest.raises(smoke.StepFailed) as failure:
        smoke.step_cycle_rejected(api, ctx)

    assert str(failure.value) == (
        "the cycle was ACCEPTED (HTTP 201, edge id 15); deleted it again as PM (DELETE /dependencies/15 -> HTTP 204); "
        "its CREATE and DELETE audit rows remain"
    )
    assert count_rows(db_session, DeliverableDependency) == 14
    assert audit_trail(db_session) == [("dependency", 15, "CREATE"), ("dependency", 15, "DELETE")]


def test_smoke_cleanup_reports_a_missing_id_and_a_failed_delete(
    client: TestClient, seeded_today: Seeded, smoke: ModuleType
) -> None:
    api = InProcessApi(client, smoke)
    pm_token, _ = smoke.login(api, "pm@acme.example", TEST_PASSWORD, "PM")
    assert smoke.delete_again(api, None, "/projects", pm_token) == "the response carried no id, so nothing was deleted"
    assert smoke.delete_again(api, 999999, "/projects", pm_token) == (
        "could NOT delete it again: DELETE /projects/999999 -> HTTP 404 NOT_FOUND: Project 999999 was not found.; "
        "delete /projects/999999 by hand"
    )
