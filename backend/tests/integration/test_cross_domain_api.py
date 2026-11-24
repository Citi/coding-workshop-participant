"""End-to-end consistency across domains, through the public API only (no SQL in this file).

A small portfolio is entered the way a team would enter it: projects, then deliverables with
dependencies (one across projects), then people, deliverable owners, allocations (one person ends
up over-allocated) and expenses (one project ends up over budget). The tests check that every
endpoint showing a number or a name shows the same one: /projects, /deliverables, /resources,
/allocations, /expenses and GET /dashboard. Then the person and the project are deleted and the
cascades and dashboard totals are checked.

"Today" is frozen, so every computed value is exact; the expected values are worked out by hand
from the rules in docs/API.md.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import pytest

from app.core import clock
from helpers import assert_error

TODAY = date(2026, 6, 15)

# --- Shapes from docs/API.md ----------------------------------------------------------------------
PROJECT_SUMMARY_FIELDS = (
    "id",
    "name",
    "department",
    "status",
    "start_date",
    "end_date",
    "progress_percent",
    "health",
    "health_reasons",
    "budget",
    "budget_spent",
    "budget_used_percent",
    "over_budget",
    "team_size",
)
BUDGET_FIELDS = ("budget", "budget_spent", "budget_remaining", "budget_used_percent", "over_budget")
DELIVERABLE_SUMMARY_FIELDS = (
    "id",
    "name",
    "project_id",
    "project_name",
    "status",
    "due_date",
    "is_key",
    "owner_name",
    "is_overdue",
)
OVER_ALLOCATED_FIELDS = ("id", "full_name", "job_title", "department", "total_allocation_percent")
UTILIZATION_FIELDS = ("total_allocation_percent", "active_project_count", "is_over_allocated")
# dashboard deliverable counter -> the project counter it adds up
DELIVERABLE_COUNTERS = {
    "total": "deliverables_total",
    "completed": "deliverables_completed",
    "overdue": "deliverables_overdue",
    "blocked": "deliverables_blocked",
    "key_total": "key_deliverables_total",
    "key_completed": "key_deliverables_completed",
}

# --- The portfolio ----------------------------------------------------------------------------------
# name: (department, status, start_date, end_date, budget)
PROJECTS = {
    "Apollo CRM": ("Sales", "active", "2026-01-01", "2026-12-31", 10000),
    "Zeus Portal": ("IT", "active", "2026-03-01", "2026-09-30", 50000),
    "Orion Analytics": ("Data", "planned", "2026-07-01", "2026-12-31", 20000),
}
# (project, name, status, due_date, is_key, depends_on)
DELIVERABLES = [
    ("Apollo CRM", "Requirements", "completed", "2026-02-01", True, []),
    ("Apollo CRM", "Design", "in_progress", "2026-06-10", False, ["Requirements"]),  # overdue on TODAY
    ("Apollo CRM", "Build", "blocked", "2026-06-20", True, ["Design"]),  # blocked, due within 14 days
    ("Apollo CRM", "Launch", "not_started", "2026-12-15", True, ["Build"]),
    ("Zeus Portal", "API contract", "completed", "2026-04-01", False, []),
    ("Zeus Portal", "Portal UI", "in_progress", "2026-08-01", False, ["Design"]),  # waits on another project
]
# full_name: (email, job_title, department)
RESOURCES = {
    "Priya Shah": ("priya.shah@acme.com", "Developer", "IT"),
    "Omar Haddad": ("omar.haddad@acme.com", "Analyst", "Finance"),
}
OWNERS = {"Design": "Priya Shah", "Build": "Omar Haddad"}  # assigned with PUT once the people exist
# (resource, project, allocation_percent)
ALLOCATIONS = [
    ("Priya Shah", "Apollo CRM", 60),
    ("Priya Shah", "Zeus Portal", 50),  # Priya: 110% -> over-allocated
    ("Priya Shah", "Orion Analytics", 30),  # planned project: lined up, but not counted
    ("Omar Haddad", "Apollo CRM", 40),
]
# description: (project, category, amount, expense_date)
EXPENSES = {
    "Contractor invoice": ("Apollo CRM", "labor", 6000, "2026-03-15"),
    "CRM licences": ("Apollo CRM", "software", 5500.25, "2026-05-02"),  # Apollo: 11,500.25 spent of 10,000
    "Test devices": ("Zeus Portal", "hardware", 1000, "2026-04-10"),
}

# Computed project fields on TODAY.
EXPECTED_PROJECTS = {
    # 1 of 4 done = 25%; 45% of the year has elapsed, exactly 20 points ahead (not more): no schedule reason
    "Apollo CRM": {
        "progress_percent": 25,
        "deliverables_total": 4,
        "deliverables_completed": 1,
        "deliverables_overdue": 1,
        "deliverables_blocked": 1,
        "key_deliverables_total": 3,
        "key_deliverables_completed": 1,
        "team_size": 2,
        "health": "at_risk",
        "health_reasons": ["1 deliverable overdue", "1 deliverable blocked"],
        "budget_spent": 11500.25,
        "budget_remaining": -1500.25,
        "budget_used_percent": 115.0,
        "over_budget": True,
    },
    # 1 of 2 done = 50%, with 50% of the schedule elapsed
    "Zeus Portal": {
        "progress_percent": 50,
        "deliverables_total": 2,
        "deliverables_completed": 1,
        "deliverables_overdue": 0,
        "deliverables_blocked": 0,
        "key_deliverables_total": 0,
        "key_deliverables_completed": 0,
        "team_size": 1,
        "health": "on_track",
        "health_reasons": [],
        "budget_spent": 1000.0,
        "budget_remaining": 49000.0,
        "budget_used_percent": 2.0,
        "over_budget": False,
    },
    # starts after TODAY and has no deliverables yet; Priya's planned 30% is its team
    "Orion Analytics": {
        "progress_percent": 0,
        "deliverables_total": 0,
        "deliverables_completed": 0,
        "deliverables_overdue": 0,
        "deliverables_blocked": 0,
        "key_deliverables_total": 0,
        "key_deliverables_completed": 0,
        "team_size": 1,
        "health": "on_track",
        "health_reasons": [],
        "budget_spent": 0.0,
        "budget_remaining": 20000.0,
        "budget_used_percent": 0.0,
        "over_budget": False,
    },
}


@dataclass
class Portfolio:
    """Ids of everything the fixture created, by name."""

    projects: dict
    deliverables: dict
    resources: dict
    allocations: dict  # (resource, project) -> id
    expenses: dict  # description -> id
    allocation_totals: list  # (resource_total_allocation_percent, resource_over_allocated) of each POST /allocations


# --- API helpers -------------------------------------------------------------------------------------
def call(api, method, path, token, expected_status, **kwargs):
    """Send a request and return its body, failing with the response when the status is unexpected."""
    result = api.request(method, path, token=token, **kwargs)
    assert result.status == expected_status, (
        f"{method} {path}: expected {expected_status}, got {result.status}: {result.body}"
    )
    return result.body


def create(api, token, path, body) -> dict:
    return call(api, "POST", path, token, 201, body=body)


def read(api, token, path, **query) -> dict:
    return call(api, "GET", path, token, 200, query=query)


def listed(api, token, path, **query) -> list[dict]:
    """The items of a list endpoint, after checking the documented {items, total} envelope."""
    body = read(api, token, path, **query)
    assert body["total"] == len(body["items"]), body
    return body["items"]


def edit(api, token, path, **changes) -> dict:
    """PUT back the object GET returned, with ``changes`` (the API ignores its computed fields)."""
    return call(api, "PUT", path, token, 200, body={**read(api, token, path), **changes})


def remove(api, token, path) -> None:
    call(api, "DELETE", path, token, 204)


def pick(row: dict, fields) -> dict:
    return {field: row[field] for field in fields}


def ids(items) -> list[int]:
    return [item["id"] for item in items]


def by_name(items) -> dict:
    return {item["name"]: item for item in items}


def budget_line(project: dict) -> dict:
    """A project as a line of the dashboard's budget_by_project."""
    return {
        "project_id": project["id"],
        "project_name": project["name"],
        "status": project["status"],
        **pick(project, BUDGET_FIELDS),
    }


def summaries(deliverables: dict, *names) -> list[dict]:
    """The named deliverables (as GET /deliverables lists them) in the dashboard's summary shape."""
    return [pick(deliverables[name], DELIVERABLE_SUMMARY_FIELDS) for name in names]


def added_up(projects) -> dict:
    """The dashboard's deliverable counters, worked out from GET /projects."""
    return {counter: sum(project[field] for project in projects) for counter, field in DELIVERABLE_COUNTERS.items()}


# --- Fixtures ----------------------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def frozen_today(monkeypatch):
    """Business rules read clock.today(); freeze it so computed fields are deterministic."""
    monkeypatch.setattr(clock, "today", lambda: TODAY)


@pytest.fixture
def viewer(tokens):
    """Checks read as the read-only role: everyone sees the same computed data."""
    return tokens["viewer"]


def _project_body(name) -> dict:
    department, status, start_date, end_date, budget = PROJECTS[name]
    return {
        "name": name,
        "department": department,
        "status": status,
        "start_date": start_date,
        "end_date": end_date,
        "budget": budget,
    }


@pytest.fixture
def portfolio(api, tokens) -> Portfolio:
    """The portfolio as a team enters it: the manager sets up the projects, a contributor the rest."""
    manager, contributor = tokens["manager"], tokens["contributor"]
    projects = {name: create(api, manager, "/projects", _project_body(name))["id"] for name in PROJECTS}

    deliverables = {}
    for project, name, status, due_date, is_key, depends_on in DELIVERABLES:
        body = {
            "project_id": projects[project],
            "name": name,
            "status": status,
            "due_date": due_date,
            "is_key": is_key,
            "depends_on_ids": [deliverables[prerequisite] for prerequisite in depends_on],
        }
        deliverables[name] = create(api, contributor, "/deliverables", body)["id"]

    resources = {
        name: create(
            api,
            contributor,
            "/resources",
            {"full_name": name, "email": email, "job_title": job_title, "department": department},
        )["id"]
        for name, (email, job_title, department) in RESOURCES.items()
    }
    for deliverable, owner in OWNERS.items():
        edit(api, contributor, f"/deliverables/{deliverables[deliverable]}", owner_id=resources[owner])

    allocations, allocation_totals = {}, []
    for resource, project, percent in ALLOCATIONS:
        body = {"resource_id": resources[resource], "project_id": projects[project], "allocation_percent": percent}
        allocation = create(api, contributor, "/allocations", body)
        allocations[resource, project] = allocation["id"]
        allocation_totals.append(
            (allocation["resource_total_allocation_percent"], allocation["resource_over_allocated"])
        )

    expenses = {
        description: create(
            api,
            contributor,
            "/expenses",
            {
                "project_id": projects[project],
                "category": category,
                "description": description,
                "amount": amount,
                "expense_date": expense_date,
            },
        )["id"]
        for description, (project, category, amount, expense_date) in EXPENSES.items()
    }
    return Portfolio(projects, deliverables, resources, allocations, expenses, allocation_totals)


# --- Tests ---------------------------------------------------------------------------------------------
class TestEndpointsAgree:
    def test_project_detail_has_the_computed_fields_of_every_domain(self, api, viewer, portfolio):
        for name, expected in EXPECTED_PROJECTS.items():
            project = read(api, viewer, f"/projects/{portfolio.projects[name]}")
            assert pick(project, expected) == expected, name
            body = _project_body(name)
            assert pick(project, body) == body, name  # the stored fields come back as sent

    def test_project_list_shows_the_same_values_as_the_detail(self, api, viewer, portfolio):
        projects = listed(api, viewer, "/projects")
        assert [project["name"] for project in projects] == ["Zeus Portal", "Apollo CRM", "Orion Analytics"]
        for project in projects:
            assert project == read(api, viewer, f"/projects/{project['id']}")
        assert ids(listed(api, viewer, "/projects", health="at_risk")) == [portfolio.projects["Apollo CRM"]]

    def test_project_counters_match_the_records_behind_them(self, api, viewer, portfolio):
        for project in listed(api, viewer, "/projects"):
            deliverables = listed(api, viewer, "/deliverables", project_id=project["id"])
            key = [item for item in deliverables if item["is_key"]]
            assert pick(project, DELIVERABLE_COUNTERS.values()) == {
                "deliverables_total": len(deliverables),
                "deliverables_completed": sum(item["status"] == "completed" for item in deliverables),
                "deliverables_overdue": sum(item["is_overdue"] for item in deliverables),
                "deliverables_blocked": sum(item["status"] == "blocked" for item in deliverables),
                "key_deliverables_total": len(key),
                "key_deliverables_completed": sum(item["status"] == "completed" for item in key),
            }, project["name"]
            assert project["team_size"] == len(listed(api, viewer, "/allocations", project_id=project["id"]))
            spent = sum(expense["amount"] for expense in listed(api, viewer, "/expenses", project_id=project["id"]))
            assert project["budget_spent"] == spent

    def test_allocation_responses_report_the_persons_total_after_each_change(self, portfolio):
        # Priya 60 -> 110 (over-allocated) -> still 110 (the planned project does not count); Omar 40
        assert portfolio.allocation_totals == [(60, False), (110, True), (110, True), (40, False)]

    def test_utilization_is_the_same_on_resources_and_allocations(self, api, viewer, portfolio):
        priya = read(api, viewer, f"/resources/{portfolio.resources['Priya Shah']}")
        assert pick(priya, UTILIZATION_FIELDS) == {
            "total_allocation_percent": 110,
            "active_project_count": 2,
            "is_over_allocated": True,
        }
        assert priya["allocations"] == [
            {
                "id": portfolio.allocations["Priya Shah", project],
                "project_id": portfolio.projects[project],
                "project_name": project,
                "project_status": status,
                "allocation_percent": percent,
            }
            for project, status, percent in [
                ("Apollo CRM", "active", 60),
                ("Orion Analytics", "planned", 30),
                ("Zeus Portal", "active", 50),
            ]
        ]
        for allocation in listed(api, viewer, "/allocations"):
            person = read(api, viewer, f"/resources/{allocation['resource_id']}")
            assert allocation["resource_name"] == person["full_name"]
            assert allocation["resource_total_allocation_percent"] == person["total_allocation_percent"]
            assert allocation["resource_over_allocated"] is person["is_over_allocated"]
        assert ids(listed(api, viewer, "/resources", over_allocated=True)) == [portfolio.resources["Priya Shah"]]

    def test_dependencies_cross_projects_and_cannot_close_a_cycle(self, api, tokens, viewer, portfolio):
        deliverables = portfolio.deliverables
        launch = read(api, viewer, f"/deliverables/{deliverables['Launch']}")
        assert ids(launch["depends_on"]) == [deliverables["Build"]]
        assert [(item["name"], item["depth"]) for item in launch["dependency_chain"]] == [
            ("Build", 1),
            ("Design", 2),
            ("Requirements", 3),
        ]
        portal = read(api, viewer, f"/deliverables/{deliverables['Portal UI']}")
        assert [(item["name"], item["project_name"], item["depth"]) for item in portal["dependency_chain"]] == [
            ("Design", "Apollo CRM", 1),
            ("Requirements", "Apollo CRM", 2),
        ]
        design = read(api, viewer, f"/deliverables/{deliverables['Design']}")
        assert [(item["name"], item["project_name"]) for item in design["blocks"]] == [
            ("Build", "Apollo CRM"),
            ("Portal UI", "Zeus Portal"),
        ]
        assert (design["owner_name"], design["is_overdue"]) == ("Priya Shah", True)

        # Requirements -> Portal UI would close the loop Requirements <- Design <- Portal UI (across projects)
        path = f"/deliverables/{deliverables['Requirements']}"
        body = {**read(api, viewer, path), "depends_on_ids": [deliverables["Portal UI"]]}
        assert_error(api.put(path, token=tokens["contributor"], body=body), 400, "VALIDATION_ERROR", "depends_on_ids")
        assert read(api, viewer, path)["depends_on_ids"] == []

        # Portal UI now waits on its own project only: both sides of the old link change
        edit(
            api,
            tokens["contributor"],
            f"/deliverables/{deliverables['Portal UI']}",
            depends_on_ids=[deliverables["API contract"]],
        )
        portal = read(api, viewer, f"/deliverables/{deliverables['Portal UI']}")
        assert [(item["name"], item["depth"]) for item in portal["dependency_chain"]] == [("API contract", 1)]
        design = read(api, viewer, f"/deliverables/{deliverables['Design']}")
        assert [item["name"] for item in design["blocks"]] == ["Build"]

    def test_every_domain_returns_utc_timestamps(self, api, tokens, viewer, portfolio):
        records = [
            read(api, viewer, f"/projects/{portfolio.projects['Apollo CRM']}"),
            read(api, viewer, f"/deliverables/{portfolio.deliverables['Design']}"),
            read(api, viewer, f"/resources/{portfolio.resources['Priya Shah']}"),
            read(api, viewer, f"/allocations/{portfolio.allocations['Priya Shah', 'Apollo CRM']}"),
            read(api, viewer, f"/expenses/{portfolio.expenses['CRM licences']}"),
            *listed(api, tokens["admin"], "/users"),
        ]
        for record in records:
            for field in ("created_at", "updated_at"):
                # docs/API.md: timestamps are ISO 8601 in UTC, whatever the database server's time zone is
                assert datetime.fromisoformat(record[field]).utcoffset() == timedelta(0), (field, record[field])


class TestDashboardAgrees:
    def test_project_sections_repeat_the_projects_endpoint(self, api, viewer, portfolio):
        projects = by_name(listed(api, viewer, "/projects"))
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["projects"] == {
            "total": 3,
            "by_status": {"planned": 1, "active": 2, "on_hold": 0, "completed": 0, "cancelled": 0},
            "by_health": {"on_track": 2, "at_risk": 1, "overdue": 0},
        }
        assert dashboard["active_projects"] == [
            pick(projects[name], PROJECT_SUMMARY_FIELDS) for name in ("Zeus Portal", "Apollo CRM")
        ]
        assert dashboard["at_risk_projects"] == [pick(projects["Apollo CRM"], PROJECT_SUMMARY_FIELDS)]

    def test_deliverable_sections_repeat_the_deliverables_endpoint(self, api, viewer, portfolio):
        projects = listed(api, viewer, "/projects")
        deliverables = by_name(listed(api, viewer, "/deliverables"))
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["deliverables"] == {
            "total": 6,
            "completed": 2,
            "overdue": 1,
            "blocked": 1,
            "key_total": 3,
            "key_completed": 1,
        }
        assert dashboard["deliverables"] == added_up(projects)
        assert dashboard["key_deliverables"] == summaries(deliverables, "Build", "Launch")  # completed ones left out
        assert dashboard["upcoming_deliverables"] == summaries(deliverables, "Build")
        assert dashboard["overdue_deliverables"] == summaries(deliverables, "Design")
        assert ids(dashboard["overdue_deliverables"]) == ids(listed(api, viewer, "/deliverables", overdue=True))
        owners = [item["owner_name"] for item in dashboard["overdue_deliverables"] + dashboard["upcoming_deliverables"]]
        assert owners == ["Priya Shah", "Omar Haddad"]

    def test_resource_sections_repeat_the_resources_endpoint(self, api, viewer, portfolio):
        priya = read(api, viewer, f"/resources/{portfolio.resources['Priya Shah']}")
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["resources"] == {"total": 2, "over_allocated": 1}
        # only the active-project allocations behind the 110% are listed (not the planned Orion one)
        active = [
            pick(allocation, ("project_id", "project_name", "allocation_percent"))
            for allocation in priya["allocations"]
            if allocation["project_status"] == "active"
        ]
        assert [item["project_name"] for item in active] == ["Apollo CRM", "Zeus Portal"]
        assert dashboard["over_allocated_resources"] == [{**pick(priya, OVER_ALLOCATED_FIELDS), "allocations": active}]

    def test_budget_sections_repeat_the_projects_and_expenses_endpoints(self, api, viewer, portfolio):
        projects = by_name(listed(api, viewer, "/projects"))
        dashboard = read(api, viewer, "/dashboard")
        # planned 80,000; spent 12,500.25 -> 15.6%
        assert dashboard["budget"] == {
            "total_planned": 80000.0,
            "total_spent": 12500.25,
            "used_percent": 15.6,
            "over_budget_projects": 1,
        }
        expenses = listed(api, viewer, "/expenses")
        assert dashboard["budget"]["total_spent"] == sum(expense["amount"] for expense in expenses)
        assert dashboard["budget_by_project"] == [
            budget_line(projects[name]) for name in ("Apollo CRM", "Zeus Portal", "Orion Analytics")
        ]


class TestChangesShowEverywhere:
    def test_finishing_work_updates_progress_health_and_the_dashboard(self, api, tokens, viewer, portfolio):
        contributor, deliverables = tokens["contributor"], portfolio.deliverables
        apollo_path = f"/projects/{portfolio.projects['Apollo CRM']}"

        edit(api, contributor, f"/deliverables/{deliverables['Design']}", status="completed")
        apollo = read(api, viewer, apollo_path)
        # 2 of 4 done; the blocked Build still puts the project at risk
        assert pick(apollo, ("progress_percent", "deliverables_overdue", "health", "health_reasons")) == {
            "progress_percent": 50,
            "deliverables_overdue": 0,
            "health": "at_risk",
            "health_reasons": ["1 deliverable blocked"],
        }
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["overdue_deliverables"] == []
        assert (dashboard["deliverables"]["completed"], dashboard["deliverables"]["overdue"]) == (3, 0)

        edit(api, contributor, f"/deliverables/{deliverables['Build']}", status="in_progress")
        apollo = read(api, viewer, apollo_path)
        assert (apollo["health"], apollo["health_reasons"]) == ("on_track", [])
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["at_risk_projects"] == []
        assert dashboard["projects"]["by_health"] == {"on_track": 3, "at_risk": 0, "overdue": 0}
        assert dashboard["active_projects"][1] == pick(apollo, PROJECT_SUMMARY_FIELDS)

    def test_pausing_a_project_stops_its_allocations_counting(self, api, tokens, viewer, portfolio):
        edit(api, tokens["manager"], f"/projects/{portfolio.projects['Zeus Portal']}", status="on_hold")

        priya = read(api, viewer, f"/resources/{portfolio.resources['Priya Shah']}")
        assert pick(priya, UTILIZATION_FIELDS) == {
            "total_allocation_percent": 60,
            "active_project_count": 1,
            "is_over_allocated": False,
        }
        allocation = read(api, viewer, f"/allocations/{portfolio.allocations['Priya Shah', 'Zeus Portal']}")
        assert pick(allocation, ("project_status", "resource_total_allocation_percent", "resource_over_allocated")) == {
            "project_status": "on_hold",
            "resource_total_allocation_percent": 60,
            "resource_over_allocated": False,
        }
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["resources"] == {"total": 2, "over_allocated": 0}
        assert dashboard["over_allocated_resources"] == []
        assert [project["name"] for project in dashboard["active_projects"]] == ["Apollo CRM"]
        assert dashboard["projects"]["by_status"] == {
            "planned": 1,
            "active": 1,
            "on_hold": 1,
            "completed": 0,
            "cancelled": 0,
        }
        assert dashboard["projects"]["by_health"] == {"on_track": 2, "at_risk": 1, "overdue": 0}  # on hold keeps health
        # the paused project's deliverables still count, as on GET /projects
        assert dashboard["deliverables"]["total"] == 6
        assert dashboard["deliverables"] == added_up(listed(api, viewer, "/projects"))

    def test_a_project_past_its_end_date_is_overdue_everywhere(self, api, tokens, viewer, portfolio):
        zeus_path = f"/projects/{portfolio.projects['Zeus Portal']}"
        edit(api, tokens["manager"], zeus_path, end_date="2026-06-01")

        zeus = read(api, viewer, zeus_path)
        assert (zeus["health"], zeus["health_reasons"]) == (
            "overdue",
            [
                "End date Jun 1, 2026 has passed",
                "100% of the schedule has elapsed but only 50% of deliverables are complete",
            ],
        )
        assert ids(listed(api, viewer, "/projects", health="overdue")) == [zeus["id"]]
        projects = by_name(listed(api, viewer, "/projects"))
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["projects"]["by_health"] == {"on_track": 1, "at_risk": 1, "overdue": 1}
        # overdue first, then at risk
        assert dashboard["at_risk_projects"] == [
            pick(projects[name], PROJECT_SUMMARY_FIELDS) for name in ("Zeus Portal", "Apollo CRM")
        ]

    def test_cancelling_a_project_takes_it_out_of_health_budget_and_utilization(self, api, tokens, viewer, portfolio):
        apollo_path = f"/projects/{portfolio.projects['Apollo CRM']}"
        edit(api, tokens["manager"], apollo_path, status="cancelled")

        apollo = read(api, viewer, apollo_path)
        assert (apollo["health"], apollo["health_reasons"], apollo["over_budget"]) == (None, [], True)
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["projects"]["by_health"] == {"on_track": 2, "at_risk": 0, "overdue": 0}
        assert dashboard["at_risk_projects"] == []
        assert dashboard["budget"] == {
            "total_planned": 70000.0,
            "total_spent": 1000.0,
            "used_percent": 1.4,
            "over_budget_projects": 0,
        }
        assert [line["project_name"] for line in dashboard["budget_by_project"]] == ["Zeus Portal", "Orion Analytics"]
        people = listed(api, viewer, "/resources")
        assert {person["full_name"]: person["total_allocation_percent"] for person in people} == {
            "Omar Haddad": 0,
            "Priya Shah": 50,
        }
        assert dashboard["resources"]["over_allocated"] == 0

    def test_changing_an_allocation_updates_every_total(self, api, tokens, viewer, portfolio):
        path = f"/allocations/{portfolio.allocations['Priya Shah', 'Apollo CRM']}"
        allocation = edit(api, tokens["contributor"], path, allocation_percent=50)
        # 50 + 50 = 100%: fully booked, not over-allocated
        assert (allocation["resource_total_allocation_percent"], allocation["resource_over_allocated"]) == (100, False)
        priya = read(api, viewer, f"/resources/{portfolio.resources['Priya Shah']}")
        assert (priya["total_allocation_percent"], priya["is_over_allocated"]) == (100, False)
        assert listed(api, viewer, "/resources", over_allocated=True) == []
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["resources"] == {"total": 2, "over_allocated": 0}
        assert dashboard["over_allocated_resources"] == []

    def test_moving_an_expense_moves_its_spend(self, api, tokens, viewer, portfolio):
        path = f"/expenses/{portfolio.expenses['CRM licences']}"
        expense = edit(api, tokens["contributor"], path, project_id=portfolio.projects["Zeus Portal"])
        assert expense["project_name"] == "Zeus Portal"

        projects = by_name(listed(api, viewer, "/projects"))
        assert pick(projects["Apollo CRM"], BUDGET_FIELDS) == {
            "budget": 10000.0,
            "budget_spent": 6000.0,
            "budget_remaining": 4000.0,
            "budget_used_percent": 60.0,
            "over_budget": False,
        }
        assert pick(projects["Zeus Portal"], BUDGET_FIELDS) == {
            "budget": 50000.0,
            "budget_spent": 6500.25,
            "budget_remaining": 43499.75,
            "budget_used_percent": 13.0,
            "over_budget": False,
        }
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["budget"] == {
            "total_planned": 80000.0,
            "total_spent": 12500.25,
            "used_percent": 15.6,
            "over_budget_projects": 0,
        }
        assert dashboard["budget_by_project"] == [
            budget_line(projects[name]) for name in ("Apollo CRM", "Zeus Portal", "Orion Analytics")
        ]

    def test_renames_show_wherever_the_name_is_displayed(self, api, tokens, viewer, portfolio):
        apollo_id, priya_id = portfolio.projects["Apollo CRM"], portfolio.resources["Priya Shah"]
        edit(api, tokens["manager"], f"/projects/{apollo_id}", name="Apollo CRM 2.0")
        edit(api, tokens["contributor"], f"/resources/{priya_id}", full_name="Priya Shah-Kumar")

        assert {item["project_name"] for item in listed(api, viewer, "/deliverables", project_id=apollo_id)} == {
            "Apollo CRM 2.0"
        }
        design = read(api, viewer, f"/deliverables/{portfolio.deliverables['Design']}")
        assert design["owner_name"] == "Priya Shah-Kumar"
        portal = read(api, viewer, f"/deliverables/{portfolio.deliverables['Portal UI']}")
        assert {item["project_name"] for item in portal["dependency_chain"]} == {"Apollo CRM 2.0"}
        allocations = listed(api, viewer, "/allocations", project_id=apollo_id)
        assert {(item["resource_name"], item["project_name"]) for item in allocations} == {
            ("Omar Haddad", "Apollo CRM 2.0"),
            ("Priya Shah-Kumar", "Apollo CRM 2.0"),
        }
        expenses = listed(api, viewer, "/expenses", project_id=apollo_id)
        assert {item["project_name"] for item in expenses} == {"Apollo CRM 2.0"}
        assert read(api, viewer, f"/resources/{priya_id}")["allocations"][0]["project_name"] == "Apollo CRM 2.0"

        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["at_risk_projects"][0]["name"] == "Apollo CRM 2.0"
        overdue = dashboard["overdue_deliverables"][0]
        assert (overdue["project_name"], overdue["owner_name"]) == ("Apollo CRM 2.0", "Priya Shah-Kumar")
        person = dashboard["over_allocated_resources"][0]
        assert (person["full_name"], person["allocations"][0]["project_name"]) == ("Priya Shah-Kumar", "Apollo CRM 2.0")
        assert dashboard["budget_by_project"][0]["project_name"] == "Apollo CRM 2.0"


class TestDeletesCascade:
    def test_deleting_a_person_removes_their_allocations_and_clears_ownership(self, api, tokens, viewer, portfolio):
        priya_id = portfolio.resources["Priya Shah"]
        assert_error(api.delete(f"/resources/{priya_id}", token=tokens["contributor"]), 403, "FORBIDDEN")
        remove(api, tokens["manager"], f"/resources/{priya_id}")

        assert_error(api.get(f"/resources/{priya_id}", token=viewer), 404, "NOT_FOUND")
        for (person, _), allocation_id in portfolio.allocations.items():
            expected = 404 if person == "Priya Shah" else 200
            assert api.get(f"/allocations/{allocation_id}", token=viewer).status == expected
        assert listed(api, viewer, "/allocations", resource_id=priya_id) == []
        design = read(api, viewer, f"/deliverables/{portfolio.deliverables['Design']}")
        assert (design["owner_id"], design["owner_name"], design["status"]) == (None, None, "in_progress")
        teams = {project["name"]: project["team_size"] for project in listed(api, viewer, "/projects")}
        assert teams == {"Zeus Portal": 0, "Apollo CRM": 1, "Orion Analytics": 0}
        omar = read(api, viewer, f"/resources/{portfolio.resources['Omar Haddad']}")
        assert omar["total_allocation_percent"] == 40

        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["resources"] == {"total": 1, "over_allocated": 0}
        assert dashboard["over_allocated_resources"] == []
        assert dashboard["overdue_deliverables"][0]["owner_name"] is None
        assert dashboard["deliverables"]["total"] == 6  # the work itself is kept

    def test_deleting_a_deliverable_unlinks_it_and_updates_the_counters(self, api, tokens, viewer, portfolio):
        deliverables = portfolio.deliverables
        remove(api, tokens["manager"], f"/deliverables/{deliverables['Design']}")

        for name in ("Build", "Portal UI"):  # both of its dependents, in two projects
            assert read(api, viewer, f"/deliverables/{deliverables[name]}")["depends_on_ids"] == []
        launch = read(api, viewer, f"/deliverables/{deliverables['Launch']}")
        assert [(item["name"], item["depth"]) for item in launch["dependency_chain"]] == [("Build", 1)]
        apollo = read(api, viewer, f"/projects/{portfolio.projects['Apollo CRM']}")
        # 1 of 3 done (33%); nothing is overdue any more, Build is still blocked
        assert pick(apollo, ("progress_percent", "deliverables_total", "deliverables_overdue", "health_reasons")) == {
            "progress_percent": 33,
            "deliverables_total": 3,
            "deliverables_overdue": 0,
            "health_reasons": ["1 deliverable blocked"],
        }
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard["overdue_deliverables"] == []
        assert dashboard["deliverables"] == added_up(listed(api, viewer, "/projects"))

    def test_deleting_a_project_removes_everything_that_belongs_to_it(self, api, tokens, viewer, portfolio):
        apollo_id = portfolio.projects["Apollo CRM"]
        assert_error(api.delete(f"/projects/{apollo_id}", token=tokens["contributor"]), 403, "FORBIDDEN")
        remove(api, tokens["manager"], f"/projects/{apollo_id}")

        assert_error(api.get(f"/projects/{apollo_id}", token=viewer), 404, "NOT_FOUND")
        for project, name, *_ in DELIVERABLES:
            expected = 404 if project == "Apollo CRM" else 200
            assert api.get(f"/deliverables/{portfolio.deliverables[name]}", token=viewer).status == expected
        for description, (project, *_) in EXPENSES.items():
            expected = 404 if project == "Apollo CRM" else 200
            assert api.get(f"/expenses/{portfolio.expenses[description]}", token=viewer).status == expected
        for (_, project), allocation_id in portfolio.allocations.items():
            expected = 404 if project == "Apollo CRM" else 200
            assert api.get(f"/allocations/{allocation_id}", token=viewer).status == expected
        for path in ("/deliverables", "/allocations", "/expenses"):
            assert listed(api, viewer, path, project_id=apollo_id) == []

        # the dependency link from the other project's deliverable is gone too
        portal = read(api, viewer, f"/deliverables/{portfolio.deliverables['Portal UI']}")
        assert (portal["depends_on_ids"], portal["depends_on"], portal["dependency_chain"]) == ([], [], [])
        # the people stay, without their Apollo allocations
        priya = read(api, viewer, f"/resources/{portfolio.resources['Priya Shah']}")
        assert pick(priya, UTILIZATION_FIELDS) == {
            "total_allocation_percent": 50,
            "active_project_count": 1,
            "is_over_allocated": False,
        }
        assert [item["project_name"] for item in priya["allocations"]] == ["Orion Analytics", "Zeus Portal"]
        omar = read(api, viewer, f"/resources/{portfolio.resources['Omar Haddad']}")
        assert (omar["total_allocation_percent"], omar["allocations"]) == (0, [])
        # the other project is unchanged
        zeus = read(api, viewer, f"/projects/{portfolio.projects['Zeus Portal']}")
        assert pick(zeus, EXPECTED_PROJECTS["Zeus Portal"]) == EXPECTED_PROJECTS["Zeus Portal"]

    def test_dashboard_totals_after_the_deletes(self, api, tokens, viewer, portfolio):
        remove(api, tokens["manager"], f"/resources/{portfolio.resources['Priya Shah']}")
        remove(api, tokens["manager"], f"/projects/{portfolio.projects['Apollo CRM']}")

        projects = by_name(listed(api, viewer, "/projects"))
        zeus = projects["Zeus Portal"]
        assert (zeus["team_size"], zeus["progress_percent"], zeus["budget_spent"]) == (0, 50, 1000.0)
        dashboard = read(api, viewer, "/dashboard")
        assert dashboard.pop("generated_at")
        assert dashboard == {
            "projects": {
                "total": 2,
                "by_status": {"planned": 1, "active": 1, "on_hold": 0, "completed": 0, "cancelled": 0},
                "by_health": {"on_track": 2, "at_risk": 0, "overdue": 0},
            },
            "active_projects": [pick(zeus, PROJECT_SUMMARY_FIELDS)],
            "at_risk_projects": [],
            "deliverables": {
                "total": 2,
                "completed": 1,
                "overdue": 0,
                "blocked": 0,
                "key_total": 0,
                "key_completed": 0,
            },
            "key_deliverables": [],
            "upcoming_deliverables": [],
            "overdue_deliverables": [],
            "resources": {"total": 1, "over_allocated": 0},
            "over_allocated_resources": [],
            # planned 50,000 + 20,000; only Zeus's 1,000 is left -> 1.4%
            "budget": {"total_planned": 70000.0, "total_spent": 1000.0, "used_percent": 1.4, "over_budget_projects": 0},
            "budget_by_project": [budget_line(projects[name]) for name in ("Zeus Portal", "Orion Analytics")],
        }
