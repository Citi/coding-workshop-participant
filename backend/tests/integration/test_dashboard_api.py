"""Integration tests: GET /dashboard on a real database.

Projects, deliverables, resources, allocations and expenses are arranged with direct SQL
(not through other domains' endpoints) and "today" is frozen, so every number is exact.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import pytest

from app.core import clock
from helpers import assert_error

TODAY = date(2026, 6, 15)

TOP_LEVEL_KEYS = [
    "generated_at",
    "projects",
    "active_projects",
    "at_risk_projects",
    "deliverables",
    "key_deliverables",
    "upcoming_deliverables",
    "overdue_deliverables",
    "resources",
    "over_allocated_resources",
    "budget",
    "budget_by_project",
]

# --- A realistic portfolio --------------------------------------------------------------------
# name: (department, status, start_date, end_date, budget)
PROJECTS = {
    "Apollo CRM": ("Sales", "active", "2026-01-01", "2026-12-31", 150000),
    "Zeus Portal": ("IT", "active", "2026-03-01", "2026-09-30", 50000),
    "Hermes Billing": ("Finance", "active", "2026-05-01", "2026-12-31", 100000),
    "Atlas Migration": ("IT", "active", "2026-01-01", "2026-06-01", 80000),
    "Orion Analytics": ("Data", "planned", "2026-07-01", "2026-12-31", 0),
    "Gemini Upgrade": ("IT", "on_hold", "2026-02-01", "2026-10-31", 30000),
    "Legacy Archive": ("Operations", "completed", "2025-01-01", "2025-12-31", 20000),
    "Mercury App": ("Marketing", "cancelled", "2026-01-01", "2026-08-31", 40000),
}
# full_name: (job_title, department)
RESOURCES = {
    "Priya Shah": ("Developer", "IT"),
    "Omar Haddad": ("Analyst", "Finance"),
    "Lena Fischer": ("Designer", "Product"),
    "Sam Lee": ("QA Engineer", "IT"),
}
# (project, deliverable, status, due_date, is_key, owner)
DELIVERABLES = [
    ("Apollo CRM", "Requirements", "completed", "2026-02-01", True, None),  # completed key: never listed
    ("Apollo CRM", "Build", "in_progress", "2026-06-10", True, "Priya Shah"),  # overdue key
    ("Apollo CRM", "Testing", "not_started", "2026-06-20", False, "Omar Haddad"),  # upcoming
    ("Apollo CRM", "Launch", "not_started", "2026-12-15", True, None),  # key, due later
    ("Zeus Portal", "Design", "completed", "2026-04-01", False, None),
    ("Zeus Portal", "API", "blocked", "2026-06-25", False, "Priya Shah"),  # blocked, upcoming
    ("Zeus Portal", "Kickoff review", "completed", "2026-06-20", False, None),  # completed: not upcoming
    ("Hermes Billing", "Spec", "completed", "2026-05-20", False, None),
    ("Hermes Billing", "Status report", "in_progress", "2026-06-15", False, None),  # due today: upcoming, not overdue
    ("Hermes Billing", "Rollout", "in_progress", "2026-06-29", False, None),  # today + 14: last upcoming day
    ("Hermes Billing", "Training", "not_started", "2026-06-30", False, None),  # today + 15: outside the window
    ("Atlas Migration", "Cutover", "in_progress", "2026-05-25", True, "Lena Fischer"),  # overdue key
    ("Gemini Upgrade", "Vendor review", "not_started", "2026-06-16", False, None),  # upcoming
    ("Legacy Archive", "Archive", "completed", "2025-12-15", False, None),
    ("Mercury App", "Prototype", "not_started", "2026-03-01", False, None),  # overdue (cancelled project)
]
# (resource, project, allocation_percent)
ALLOCATIONS = [
    ("Priya Shah", "Apollo CRM", 60),
    ("Priya Shah", "Zeus Portal", 60),  # Priya: 120% -> over-allocated
    ("Omar Haddad", "Apollo CRM", 50),
    ("Omar Haddad", "Mercury App", 70),  # cancelled project: not counted -> Omar 50%
    ("Lena Fischer", "Hermes Billing", 80),
    ("Lena Fischer", "Atlas Migration", 30),
    ("Lena Fischer", "Orion Analytics", 50),  # planned project: not counted -> Lena 110%
]
# (project, amount)
EXPENSES = [
    ("Apollo CRM", 40000),
    ("Apollo CRM", 21000),
    ("Zeus Portal", 60000),
    ("Hermes Billing", 10000),
    ("Atlas Migration", 20000),
    ("Orion Analytics", 500),
    ("Legacy Archive", 18000),
    ("Mercury App", 5000),
]
# Computed fields on TODAY:
# (progress %, health, health_reasons, budget_spent, budget_used_percent, over_budget, team_size)
PROJECT_METRICS = {
    # 1 of 4 done = 25%; 45% of the year elapsed is exactly 20 points ahead (not more) -> only "Build" counts
    "Apollo CRM": (25, "at_risk", ["1 deliverable overdue"], 61000.0, 40.7, False, 2),
    # 2 of 3 done = 67%; "API" is blocked; 60k spent of 50k
    "Zeus Portal": (67, "at_risk", ["1 deliverable blocked"], 60000.0, 120.0, True, 1),
    # 1 of 4 done = 25% with only 18% of the schedule elapsed
    "Hermes Billing": (25, "on_track", [], 10000.0, 10.0, False, 1),
    "Atlas Migration": (
        0,
        "overdue",
        [
            "End date Jun 1, 2026 has passed",
            "1 deliverable overdue",
            "100% of the schedule has elapsed but only 0% of deliverables are complete",
        ],
        20000.0,
        25.0,
        False,
        1,
    ),
    # 500 spent against a zero budget: the used % is unknown (null)
    "Orion Analytics": (0, "on_track", [], 500.0, None, True, 1),
    "Gemini Upgrade": (
        0,
        "at_risk",
        ["49% of the schedule has elapsed but only 0% of deliverables are complete"],
        0.0,
        0.0,
        False,
        0,
    ),
    "Legacy Archive": (100, None, [], 18000.0, 90.0, False, 0),
    "Mercury App": (0, None, [], 5000.0, 12.5, False, 1),
}


@dataclass
class Portfolio:
    projects: dict
    resources: dict
    deliverables: dict


@pytest.fixture(autouse=True)
def frozen_today(monkeypatch):
    monkeypatch.setattr(clock, "today", lambda: TODAY)


def add_project(
    db_conn, name, department="IT", status="active", start_date="2026-01-01", end_date="2026-12-31", budget=0
):
    return db_conn.execute(
        "INSERT INTO projects (name, department, status, start_date, end_date, budget)"
        " VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
        (name, department, status, start_date, end_date, budget),
    ).fetchone()["id"]


def add_resource(db_conn, full_name, job_title="Developer", department="IT"):
    email = full_name.lower().replace(" ", ".") + "@acme.com"
    return db_conn.execute(
        "INSERT INTO resources (full_name, email, job_title, department) VALUES (%s, %s, %s, %s) RETURNING id",
        (full_name, email, job_title, department),
    ).fetchone()["id"]


def add_deliverable(db_conn, project_id, name, status="not_started", due_date=TODAY, is_key=False, owner_id=None):
    return db_conn.execute(
        "INSERT INTO deliverables (project_id, name, status, due_date, is_key, owner_id)"
        " VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
        (project_id, name, status, due_date, is_key, owner_id),
    ).fetchone()["id"]


def allocate(db_conn, resource_id, project_id, percent):
    db_conn.execute(
        "INSERT INTO allocations (resource_id, project_id, allocation_percent) VALUES (%s, %s, %s)",
        (resource_id, project_id, percent),
    )


def add_expense(db_conn, project_id, amount):
    db_conn.execute(
        "INSERT INTO expenses (project_id, category, description, amount, expense_date)"
        " VALUES (%s, 'labor', 'Work', %s, '2026-03-01')",
        (project_id, amount),
    )


@pytest.fixture
def portfolio(db_conn) -> Portfolio:
    projects = {name: add_project(db_conn, name, *row) for name, row in PROJECTS.items()}
    resources = {name: add_resource(db_conn, name, *row) for name, row in RESOURCES.items()}
    deliverables = {
        name: add_deliverable(db_conn, projects[project], name, status, due, is_key, resources.get(owner))
        for project, name, status, due, is_key, owner in DELIVERABLES
    }
    for resource, project, percent in ALLOCATIONS:
        allocate(db_conn, resources[resource], projects[project], percent)
    for project, amount in EXPENSES:
        add_expense(db_conn, projects[project], amount)
    return Portfolio(projects, resources, deliverables)


def get_dashboard(api, tokens, role="viewer"):
    result = api.get("/dashboard", token=tokens[role])
    assert result.status == 200, result.body
    return result.body


def project_summary(portfolio, name):
    department, status, start_date, end_date, budget = PROJECTS[name]
    progress, health, reasons, spent, used, over_budget, team_size = PROJECT_METRICS[name]
    return {
        "id": portfolio.projects[name],
        "name": name,
        "department": department,
        "status": status,
        "start_date": start_date,
        "end_date": end_date,
        "progress_percent": progress,
        "health": health,
        "health_reasons": reasons,
        "budget": float(budget),
        "budget_spent": spent,
        "budget_used_percent": used,
        "over_budget": over_budget,
        "team_size": team_size,
    }


def deliverable_summary(portfolio, name, *, is_overdue):
    project, _, status, due_date, is_key, owner = next(row for row in DELIVERABLES if row[1] == name)
    return {
        "id": portfolio.deliverables[name],
        "name": name,
        "project_id": portfolio.projects[project],
        "project_name": project,
        "status": status,
        "due_date": due_date,
        "is_key": is_key,
        "owner_name": owner,
        "is_overdue": is_overdue,
    }


def allocation(portfolio, project, percent):
    return {"project_id": portfolio.projects[project], "project_name": project, "allocation_percent": percent}


def budget_line(portfolio, name):
    _, status, _, _, budget = PROJECTS[name]
    _, _, _, spent, used, over_budget, _ = PROJECT_METRICS[name]
    return {
        "project_id": portfolio.projects[name],
        "project_name": name,
        "status": status,
        "budget": float(budget),
        "budget_spent": spent,
        "budget_remaining": budget - spent,
        "budget_used_percent": used,
        "over_budget": over_budget,
    }


def names(items):
    return [item.get("name") or item.get("full_name") for item in items]


class TestPortfolioOverview:
    def test_response_has_the_documented_sections_in_order(self, api, tokens, portfolio):
        assert list(get_dashboard(api, tokens)) == TOP_LEVEL_KEYS

    def test_project_counters(self, api, tokens, portfolio):
        assert get_dashboard(api, tokens)["projects"] == {
            "total": 8,
            "by_status": {"planned": 1, "active": 4, "on_hold": 1, "completed": 1, "cancelled": 1},
            # completed and cancelled projects have no health, so they are not counted here
            "by_health": {"on_track": 2, "at_risk": 3, "overdue": 1},
        }

    def test_active_projects_by_end_date(self, api, tokens, portfolio):
        # Apollo and Hermes end on the same day, so they are sorted by name
        expected = ["Atlas Migration", "Zeus Portal", "Apollo CRM", "Hermes Billing"]
        assert get_dashboard(api, tokens)["active_projects"] == [project_summary(portfolio, name) for name in expected]

    def test_at_risk_projects_overdue_first_then_by_end_date(self, api, tokens, portfolio):
        expected = ["Atlas Migration", "Zeus Portal", "Gemini Upgrade", "Apollo CRM"]  # includes the on-hold project
        assert get_dashboard(api, tokens)["at_risk_projects"] == [project_summary(portfolio, name) for name in expected]

    def test_deliverable_counters_cover_every_project(self, api, tokens, portfolio):
        assert get_dashboard(api, tokens)["deliverables"] == {
            "total": 15,
            "completed": 5,
            "overdue": 3,
            "blocked": 1,
            "key_total": 4,
            "key_completed": 1,
        }

    def test_key_deliverables_are_open_key_deliverables_by_due_date(self, api, tokens, portfolio):
        assert get_dashboard(api, tokens)["key_deliverables"] == [
            deliverable_summary(portfolio, "Cutover", is_overdue=True),
            deliverable_summary(portfolio, "Build", is_overdue=True),
            deliverable_summary(portfolio, "Launch", is_overdue=False),
        ]

    def test_upcoming_deliverables_are_due_within_14_days(self, api, tokens, portfolio):
        expected = ["Status report", "Vendor review", "Testing", "API", "Rollout"]
        upcoming = get_dashboard(api, tokens)["upcoming_deliverables"]
        assert upcoming == [deliverable_summary(portfolio, name, is_overdue=False) for name in expected]

    def test_overdue_deliverables_by_due_date(self, api, tokens, portfolio):
        expected = ["Prototype", "Cutover", "Build"]
        overdue = get_dashboard(api, tokens)["overdue_deliverables"]
        assert overdue == [deliverable_summary(portfolio, name, is_overdue=True) for name in expected]

    def test_resources_and_over_allocated_people(self, api, tokens, portfolio):
        body = get_dashboard(api, tokens)
        assert body["resources"] == {"total": 4, "over_allocated": 2}
        assert body["over_allocated_resources"] == [
            {
                "id": portfolio.resources["Priya Shah"],
                "full_name": "Priya Shah",
                "job_title": "Developer",
                "department": "IT",
                "total_allocation_percent": 120,
                "allocations": [allocation(portfolio, "Apollo CRM", 60), allocation(portfolio, "Zeus Portal", 60)],
            },
            {
                "id": portfolio.resources["Lena Fischer"],
                "full_name": "Lena Fischer",
                "job_title": "Designer",
                "department": "Product",
                "total_allocation_percent": 110,
                # the planned Orion allocation is not part of the total, so it is not listed
                "allocations": [
                    allocation(portfolio, "Atlas Migration", 30),
                    allocation(portfolio, "Hermes Billing", 80),
                ],
            },
        ]

    def test_budget_totals_leave_out_cancelled_projects(self, api, tokens, portfolio):
        # planned 430,000 (Mercury's 40,000 excluded); spent 169,500 (Mercury's 5,000 excluded) -> 39.4%
        assert get_dashboard(api, tokens)["budget"] == {
            "total_planned": 430000.0,
            "total_spent": 169500.0,
            "used_percent": 39.4,
            "over_budget_projects": 2,
        }

    def test_budget_by_project_highest_use_first_unknown_on_top(self, api, tokens, portfolio):
        expected = [
            "Orion Analytics",
            "Zeus Portal",
            "Legacy Archive",
            "Apollo CRM",
            "Atlas Migration",
            "Hermes Billing",
            "Gemini Upgrade",
        ]
        budget = get_dashboard(api, tokens)["budget_by_project"]
        assert budget == [budget_line(portfolio, name) for name in expected]

    @pytest.mark.parametrize("role", ["admin", "manager", "contributor"])
    def test_every_role_sees_the_same_numbers(self, api, tokens, portfolio, role):
        viewer, other = get_dashboard(api, tokens), get_dashboard(api, tokens, role)
        assert {key: value for key, value in other.items() if key != "generated_at"} == {
            key: value for key, value in viewer.items() if key != "generated_at"
        }


class TestEmptyPortfolio:
    def test_every_section_is_present_with_zero_values(self, api, tokens):
        body = get_dashboard(api, tokens)
        assert body.pop("generated_at")
        assert body == {
            "projects": {
                "total": 0,
                "by_status": {"planned": 0, "active": 0, "on_hold": 0, "completed": 0, "cancelled": 0},
                "by_health": {"on_track": 0, "at_risk": 0, "overdue": 0},
            },
            "active_projects": [],
            "at_risk_projects": [],
            "deliverables": {
                "total": 0,
                "completed": 0,
                "overdue": 0,
                "blocked": 0,
                "key_total": 0,
                "key_completed": 0,
            },
            "key_deliverables": [],
            "upcoming_deliverables": [],
            "overdue_deliverables": [],
            "resources": {"total": 0, "over_allocated": 0},
            "over_allocated_resources": [],
            "budget": {"total_planned": 0.0, "total_spent": 0.0, "used_percent": 0.0, "over_budget_projects": 0},
            "budget_by_project": [],
        }


class TestDeliverableLists:
    def test_lists_hold_at_most_10_sorted_by_due_date_then_id(self, api, tokens, db_conn):
        project = add_project(db_conn, "Apollo CRM")
        ids = {}
        for days in range(1, 13):  # inserted newest due date first, so the ids run against the due dates
            due_date = TODAY - timedelta(days=days)
            ids[days] = add_deliverable(db_conn, project, f"Late {days}", due_date=due_date, is_key=True)
        tie = add_deliverable(db_conn, project, "Late 12 again", due_date=TODAY - timedelta(days=12), is_key=True)
        expected = [ids[12], tie, *(ids[days] for days in range(11, 3, -1))]

        body = get_dashboard(api, tokens)
        assert [item["id"] for item in body["key_deliverables"]] == expected
        assert [item["id"] for item in body["overdue_deliverables"]] == expected
        # the counters are not capped
        assert (body["deliverables"]["overdue"], body["deliverables"]["key_total"]) == (13, 13)

    def test_upcoming_list_holds_the_10_soonest(self, api, tokens, db_conn):
        project = add_project(db_conn, "Apollo CRM")
        for days in range(12):
            add_deliverable(db_conn, project, f"Soon {days}", due_date=TODAY + timedelta(days=days))
        upcoming = get_dashboard(api, tokens)["upcoming_deliverables"]
        assert names(upcoming) == [f"Soon {days}" for days in range(10)]

    def test_upcoming_window_runs_from_today_to_today_plus_14(self, api, tokens, db_conn):
        project = add_project(db_conn, "Apollo CRM")
        for name, days, status in [
            ("Yesterday", -1, "in_progress"),
            ("Today", 0, "blocked"),
            ("In 14 days", 14, "not_started"),
            ("In 15 days", 15, "not_started"),
            ("Done tomorrow", 1, "completed"),
        ]:
            add_deliverable(db_conn, project, name, status, TODAY + timedelta(days=days))
        body = get_dashboard(api, tokens)
        assert names(body["upcoming_deliverables"]) == ["Today", "In 14 days"]
        assert [item["is_overdue"] for item in body["upcoming_deliverables"]] == [False, False]
        assert names(body["overdue_deliverables"]) == ["Yesterday"]
        assert body["key_deliverables"] == []


class TestResourceUtilization:
    def test_only_allocations_to_active_projects_count(self, api, tokens, db_conn):
        active, other = add_project(db_conn, "Apollo CRM"), add_project(db_conn, "Zeus Portal")
        paused = add_project(db_conn, "Hermes Billing", status="on_hold")
        ann, zoe, bob = (add_resource(db_conn, name) for name in ("Ann Lee", "Zoe King", "Bob Ray"))
        for resource, project, percent in [
            (ann, active, 60),
            (ann, other, 40),  # exactly 100%: not over-allocated
            (zoe, active, 70),
            (zoe, other, 40),
            (zoe, paused, 50),  # 110% (the on-hold 50% does not count)
            (bob, active, 55),
            (bob, other, 55),  # 110%: same total as Zoe, so sorted by name
        ]:
            allocate(db_conn, resource, project, percent)

        body = get_dashboard(api, tokens)
        assert body["resources"] == {"total": 3, "over_allocated": 2}
        over = body["over_allocated_resources"]
        assert [(person["full_name"], person["total_allocation_percent"]) for person in over] == [
            ("Bob Ray", 110),
            ("Zoe King", 110),
        ]
        assert [allocation["project_name"] for allocation in over[1]["allocations"]] == ["Apollo CRM", "Zeus Portal"]


class TestBudget:
    def test_used_percent_is_zero_when_nothing_is_planned(self, api, tokens, db_conn):
        add_expense(db_conn, add_project(db_conn, "Apollo CRM", budget=0), 500)
        body = get_dashboard(api, tokens)
        assert body["budget"] == {
            "total_planned": 0.0,
            "total_spent": 500.0,
            "used_percent": 0.0,
            "over_budget_projects": 1,
        }
        assert body["budget_by_project"][0]["budget_used_percent"] is None

    def test_cancelled_projects_only_show_in_the_status_counts(self, api, tokens, db_conn):
        add_expense(db_conn, add_project(db_conn, "Mercury App", status="cancelled", budget=40000), 50000)
        body = get_dashboard(api, tokens)
        assert body["projects"]["by_status"]["cancelled"] == 1
        assert body["budget"] == {
            "total_planned": 0.0,
            "total_spent": 0.0,
            "used_percent": 0.0,
            "over_budget_projects": 0,
        }
        assert body["budget_by_project"] == []


class TestGeneratedAt:
    def test_is_the_current_utc_time_to_the_second(self, api, tokens, monkeypatch):
        monkeypatch.setattr(clock, "now", lambda: datetime(2026, 6, 15, 9, 30, 15, 123456, tzinfo=UTC))
        assert get_dashboard(api, tokens)["generated_at"] == "2026-06-15T09:30:15+00:00"

    def test_real_clock(self, api, tokens):
        generated_at = datetime.fromisoformat(get_dashboard(api, tokens)["generated_at"])
        assert generated_at.tzinfo is not None
        assert abs(datetime.now(UTC) - generated_at) < timedelta(minutes=1)


class TestPermissions:
    @pytest.mark.parametrize("role", ["admin", "manager", "contributor", "viewer"])
    def test_every_role_can_read_the_dashboard(self, api, tokens, role):
        assert api.get("/dashboard", token=tokens[role]).status == 200

    def test_requires_authentication(self, api):
        assert_error(api.get("/dashboard"), 401, "AUTH_REQUIRED")

    def test_rejects_an_invalid_token(self, api):
        assert_error(api.get("/dashboard", token="not-a-jwt"), 401, "INVALID_TOKEN")

    def test_disabled_account_is_rejected(self, api, tokens, db_conn):
        db_conn.execute("UPDATE users SET is_active = FALSE WHERE email = 'viewer@acme.com'")
        assert_error(api.get("/dashboard", token=tokens["viewer"]), 401, "ACCOUNT_DISABLED")

    def test_read_only_endpoint(self, api, tokens):
        assert_error(api.post("/dashboard", token=tokens["admin"], body={}), 405, "METHOD_NOT_ALLOWED")
