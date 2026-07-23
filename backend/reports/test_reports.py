"""
Unit tests for the reports service.

    cd backend/reports && python -m pytest test_reports.py -v
"""

import json
from datetime import date

import pytest

import routes
import service
from _shared import auth as shared_auth

PROJECT_ID = "22222222-2222-2222-2222-222222222222"
RESOURCE_ID = "55555555-5555-5555-5555-555555555555"
DELIVERABLE_ID = "33333333-3333-3333-3333-333333333333"

HEALTHY = {
    "id": PROJECT_ID,
    "name": "Atlas Migration",
    "status": "active",
    "end_date": date(2026, 12, 31),
    "planned_budget": 100000,
    "budget_consumed": 40000,
    "avg_completion": 85.0,
    "at_risk": False,
    "overdue_count": 0,
    "deliverable_count": 5,
    "days_remaining": 200,
    "owner_name": "Ada Sanders",
}


def make_event(role="STAKEHOLDER", query=None):
    return {
        "rawPath": "/reports/summary",
        "requestContext": {"http": {"method": "GET"}},
        "headers": {
            "authorization": "Bearer "
            + shared_auth.create_access_token(
                {"id": PROJECT_ID, "email": "user@acme.test", "role": role}
            )
        },
        "queryStringParameters": query,
    }


def body_of(response):
    return json.loads(response["body"])


# --------------------------------------------------------------------------
# Risk scoring
# --------------------------------------------------------------------------


def test_healthy_project_scores_low():
    assert routes._risk_level(HEALTHY) == "Low"
    assert routes._risk_reasons(HEALTHY) == []


def test_overdue_deliverables_raise_risk():
    row = {**HEALTHY, "overdue_count": 3}
    assert routes._risk_level(row) == "Medium"
    assert "3 overdue deliverables" in routes._risk_reasons(row)


def test_single_overdue_deliverable_is_singular():
    assert "1 overdue deliverable" in routes._risk_reasons({**HEALTHY, "overdue_count": 1})


def test_past_end_date_dominates_the_score():
    """Already late counts double -- it is the strongest signal there is."""
    row = {**HEALTHY, "days_remaining": -10, "overdue_count": 1}
    assert routes._risk_level(row) == "High"
    assert "10 days past the end date" in routes._risk_reasons(row)


def test_overspend_is_a_risk_reason():
    row = {**HEALTHY, "budget_consumed": 150000}
    assert "over planned budget" in routes._risk_reasons(row)


def test_low_completion_is_reported():
    row = {**HEALTHY, "avg_completion": 30.0}
    assert any("30% complete" in reason for reason in routes._risk_reasons(row))


def test_project_with_no_deliverables_is_flagged():
    row = {**HEALTHY, "deliverable_count": 0, "avg_completion": None}
    assert "no deliverables recorded" in routes._risk_reasons(row)


def test_imminent_deadline_is_reported():
    assert "7 days remaining" in routes._risk_reasons({**HEALTHY, "days_remaining": 7})


def test_multiple_signals_reach_high():
    row = {**HEALTHY, "overdue_count": 2, "budget_consumed": 200000, "avg_completion": 20.0}
    assert routes._risk_level(row) == "High"


def test_missing_dates_do_not_crash_scoring():
    """A project with no end date must still score, not raise."""
    row = {**HEALTHY, "days_remaining": None, "end_date": None, "avg_completion": None}
    assert routes._risk_level(row) in ("Low", "Medium", "High")
    assert isinstance(routes._risk_reasons(row), list)


# --------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------


SUMMARY_ROW = {
    "total_projects": 10,
    "active_projects": 6,
    "completed_projects": 3,
    "at_risk_projects": 2,
    "total_deliverables": 40,
    "overdue_deliverables": 5,
    "blocked_deliverables": 2,
    "total_resources": 12,
    "over_allocated_resources": 3,
    "total_planned_budget": 500000,
    "total_consumed_budget": 200000,
}


def test_summary_shape(monkeypatch):
    monkeypatch.setattr(service, "dashboard_summary", lambda: SUMMARY_ROW)
    monkeypatch.setattr(
        service, "project_status_breakdown",
        lambda: [{"status": "active", "count": 6}, {"status": "completed", "count": 3}],
    )

    payload = body_of(routes.summary(make_event()))

    assert payload["projects"]["atRisk"] == 2
    assert payload["projects"]["byStatus"]["active"] == 6
    assert payload["deliverables"]["overdue"] == 5
    assert payload["resources"]["overAllocated"] == 3
    assert payload["budget"]["variance"] == 300000
    assert payload["budget"]["consumedRatio"] == 0.4


def test_summary_handles_zero_planned_budget(monkeypatch):
    monkeypatch.setattr(
        service, "dashboard_summary",
        lambda: {**SUMMARY_ROW, "total_planned_budget": 0, "total_consumed_budget": 0},
    )
    monkeypatch.setattr(service, "project_status_breakdown", lambda: [])

    payload = body_of(routes.summary(make_event()))
    assert payload["budget"]["consumedRatio"] is None


# --------------------------------------------------------------------------
# Utilization
# --------------------------------------------------------------------------


def test_utilization_reports_a_fraction_alongside_the_percent(monkeypatch):
    monkeypatch.setattr(
        service, "utilization",
        lambda: [{
            "id": RESOURCE_ID, "full_name": "Ada Sanders", "role_title": "Engineer",
            "capacity_pct": 100, "allocated_pct": 130, "project_count": 3,
            "is_over_allocated": True,
        }],
    )

    row = body_of(routes.utilization(make_event()))[0]
    assert row["allocatedPct"] == 130
    assert row["utilization"] == 1.3
    assert row["isOverAllocated"] is True


# --------------------------------------------------------------------------
# Dependencies
# --------------------------------------------------------------------------


def test_dependency_graph_returns_nodes_edges_and_bottlenecks(monkeypatch):
    monkeypatch.setattr(
        service, "dependency_graph",
        lambda project_id=None: (
            [{
                "id": DELIVERABLE_ID, "name": "Design schema", "status": "in_progress",
                "due_date": date(2026, 3, 1), "completion_percentage": 40,
                "project_id": PROJECT_ID, "project_name": "Atlas", "is_overdue": False,
            }],
            [{"deliverable_id": DELIVERABLE_ID, "depends_on_id": RESOURCE_ID}],
        ),
    )
    monkeypatch.setattr(
        service, "bottlenecks",
        lambda: [{
            "id": DELIVERABLE_ID, "name": "Provision database", "project_name": "Atlas",
            "status": "blocked", "due_date": date(2026, 2, 1),
            "completion_percentage": 10, "blocking_count": 4, "is_overdue": True,
        }],
    )

    payload = body_of(routes.dependencies(make_event()))

    assert payload["nodes"][0]["name"] == "Design schema"
    assert payload["edges"][0]["dependsOn"] == RESOURCE_ID
    assert payload["bottlenecks"][0]["blockingCount"] == 4


# --------------------------------------------------------------------------
# Budget report
# --------------------------------------------------------------------------


def test_budget_report_computes_ratio_and_guards_zero(monkeypatch):
    monkeypatch.setattr(
        service, "budget_report",
        lambda: [
            {"id": PROJECT_ID, "name": "Atlas", "status": "active", "planned_budget": 100000,
             "budget_consumed": 25000, "expense_count": 2, "variance": 75000,
             "is_overspent": False},
            {"id": RESOURCE_ID, "name": "Unbudgeted", "status": "planning", "planned_budget": 0,
             "budget_consumed": 500, "expense_count": 1, "variance": -500,
             "is_overspent": True},
        ],
    )

    rows = body_of(routes.budget(make_event()))
    assert rows[0]["consumedRatio"] == 0.25
    assert rows[1]["consumedRatio"] is None


# --------------------------------------------------------------------------
# Access control — read-only for everyone signed in
# --------------------------------------------------------------------------


@pytest.mark.parametrize("role", ["ADMIN", "PROJECT_MANAGER", "TEAM_LEADER", "STAKEHOLDER"])
def test_reporting_roles_can_read_reports(role, monkeypatch):
    monkeypatch.setattr(service, "utilization", lambda: [])
    assert routes.utilization(make_event(role=role))["statusCode"] == 200


def test_unauthenticated_report_is_rejected():
    event = {"rawPath": "/reports/summary",
             "requestContext": {"http": {"method": "GET"}}, "headers": {}}
    with pytest.raises(shared_auth.AuthError) as exc:
        routes.summary(event)
    assert exc.value.status == 401


def test_at_risk_limit_is_passed_through(monkeypatch):
    captured = {}
    monkeypatch.setattr(
        service, "at_risk_projects",
        lambda limit=None: captured.update(limit=limit) or [],
    )

    routes.at_risk(make_event(query={"limit": "5"}))
    assert captured["limit"] == 5


def test_at_risk_ignores_a_non_numeric_limit(monkeypatch):
    captured = {}
    monkeypatch.setattr(
        service, "at_risk_projects",
        lambda limit=None: captured.update(limit=limit) or [],
    )

    routes.at_risk(make_event(query={"limit": "; DROP TABLE projects"}))
    assert captured["limit"] is None
