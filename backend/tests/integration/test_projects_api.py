"""Integration tests: /projects CRUD, filters, computed fields and RBAC (real database)."""

import json
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

import function
from app.core import clock
from app.projects import repository, service
from helpers import assert_error, make_event

TODAY = date(2026, 6, 15)

PROJECT_FIELDS = {
    "id",
    "name",
    "description",
    "department",
    "status",
    "start_date",
    "end_date",
    "budget",
    "created_at",
    "updated_at",
    "progress_percent",
    "deliverables_total",
    "deliverables_completed",
    "deliverables_overdue",
    "deliverables_blocked",
    "key_deliverables_total",
    "key_deliverables_completed",
    "team_size",
    "health",
    "health_reasons",
    "budget_spent",
    "budget_remaining",
    "budget_used_percent",
    "over_budget",
}


@pytest.fixture(autouse=True)
def frozen_today(monkeypatch):
    """Business rules read clock.today(); freeze it so computed fields are deterministic."""
    monkeypatch.setattr(clock, "today", lambda: TODAY)


@pytest.fixture
def admin(tokens):
    return tokens["admin"]


def project_body(**overrides) -> dict:
    """A valid body; the project starts after TODAY, so its health is on_track by default."""
    body = {
        "name": "Apollo CRM",
        "description": "Customer portal",
        "department": "Sales",
        "status": "active",
        "start_date": "2026-07-01",
        "end_date": "2026-12-31",
        "budget": 150000,
    }
    body.update(overrides)
    return body


def create_project(api, token, **overrides) -> dict:
    result = api.post("/projects", token=token, body=project_body(**overrides))
    assert result.status == 201, result.body
    return result.body


def names(result) -> list[str]:
    assert result.status == 200, result.body
    assert result.body["total"] == len(result.body["items"])
    return [item["name"] for item in result.body["items"]]


# Other domains are arranged with direct SQL, never through their endpoints.
def add_deliverable(db_conn, project_id, name, *, status="not_started", due_date=date(2026, 9, 1), is_key=False) -> int:
    return db_conn.execute(
        "INSERT INTO deliverables (project_id, name, status, due_date, is_key) VALUES (%s, %s, %s, %s, %s) RETURNING id",
        (project_id, name, status, due_date, is_key),
    ).fetchone()["id"]


def add_resource(db_conn, email) -> int:
    return db_conn.execute(
        "INSERT INTO resources (full_name, email, job_title, department) VALUES ('Team Member', %s, 'Developer', 'IT')"
        " RETURNING id",
        (email,),
    ).fetchone()["id"]


def add_allocation(db_conn, resource_id, project_id, percent=50) -> None:
    db_conn.execute(
        "INSERT INTO allocations (resource_id, project_id, allocation_percent) VALUES (%s, %s, %s)",
        (resource_id, project_id, percent),
    )


def add_expense(db_conn, project_id, amount) -> None:
    db_conn.execute(
        "INSERT INTO expenses (project_id, category, description, amount, expense_date)"
        " VALUES (%s, 'software', 'Licences', %s, '2026-02-01')",
        (project_id, amount),
    )


class TestCreate:
    def test_creates_project_with_computed_fields(self, api, admin, db_conn):
        result = api.post("/projects", token=admin, body=project_body(name="  Apollo CRM  ", department=" Sales "))
        assert result.status == 201
        project = result.body
        assert set(project) == PROJECT_FIELDS
        assert {key: project[key] for key in project_body()} == project_body(budget=150000.0)
        assert project["created_at"] and project["updated_at"]
        assert project["progress_percent"] == 0 and project["deliverables_total"] == 0 and project["team_size"] == 0
        assert (project["health"], project["health_reasons"]) == ("on_track", [])
        assert (project["budget_spent"], project["budget_remaining"]) == (0.0, 150000.0)
        assert (project["budget_used_percent"], project["over_budget"]) == (0.0, False)

        row = db_conn.execute("SELECT * FROM projects WHERE id = %s", (project["id"],)).fetchone()
        assert (row["name"], row["department"], row["status"]) == ("Apollo CRM", "Sales", "active")
        assert (row["start_date"], row["end_date"]) == (date(2026, 7, 1), date(2026, 12, 31))
        assert row["budget"] == Decimal("150000.00")

    def test_optional_fields_have_defaults(self, api, admin):
        body = {"name": "Minimal", "department": "IT", "start_date": "2026-07-01", "end_date": "2026-07-01"}
        project = api.post("/projects", token=admin, body=body).body
        assert (project["description"], project["status"], project["budget"]) == ("", "planned", 0.0)
        assert project["start_date"] == project["end_date"]

    def test_budget_accepts_the_largest_amount_and_cents(self, api, admin):
        assert create_project(api, admin, name="Max", budget=999999999999.99)["budget"] == 999999999999.99
        assert create_project(api, admin, name="Cents", budget=1234.5)["budget"] == 1234.5

    def test_text_fields_accept_their_maximum_length(self, api, admin):
        project = create_project(api, admin, name="n" * 150, department="d" * 100, description="x" * 5000)
        assert (len(project["name"]), len(project["department"]), len(project["description"])) == (150, 100, 5000)

    def test_missing_required_fields(self, api, admin):
        error = assert_error(api.post("/projects", token=admin, body={}), 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"name", "department", "start_date", "end_date"}
        assert error["details"]["name"] == "This field is required"

    @pytest.mark.parametrize(
        "overrides, field",
        [
            ({"name": ""}, "name"),
            ({"name": "   "}, "name"),
            ({"name": "x" * 151}, "name"),
            ({"department": ""}, "department"),
            ({"department": "x" * 101}, "department"),
            ({"description": "x" * 5001}, "description"),
            ({"status": "archived"}, "status"),
            ({"start_date": "2026-02-30"}, "start_date"),
            ({"end_date": "31/12/2026"}, "end_date"),
            # numbers are not dates: lax parsing would read them as Unix timestamps (0 -> 1970-01-01)
            ({"start_date": 0}, "start_date"),
            ({"start_date": "0"}, "start_date"),
            ({"end_date": 1798675200}, "end_date"),
            ({"end_date": "2026-12-31T00:00:00"}, "end_date"),
            ({"name": 123}, "name"),
            ({"department": ["Sales"]}, "department"),
            ({"budget": True}, "budget"),
            ({"budget": -1}, "budget"),
            ({"budget": 1000000000000}, "budget"),
            ({"budget": 10.555}, "budget"),
            ({"budget": "lots"}, "budget"),
            ({"budget": None}, "budget"),
        ],
    )
    def test_invalid_field(self, api, admin, overrides, field):
        error = assert_error(
            api.post("/projects", token=admin, body=project_body(**overrides)), 400, "VALIDATION_ERROR"
        )
        assert set(error["details"]) == {field}

    def test_end_date_must_not_be_before_start_date(self, api, admin):
        body = project_body(start_date="2026-07-02", end_date="2026-07-01")
        error = assert_error(api.post("/projects", token=admin, body=body), 400, "VALIDATION_ERROR")
        assert error["details"] == {"end_date": "Must be on or after start_date"}

    def test_malformed_bodies(self, api, admin):
        assert_error(api.post("/projects", token=admin, raw_body="{oops"), 400, "INVALID_JSON")
        assert_error(api.post("/projects", token=admin, body=[1, 2]), 400, "VALIDATION_ERROR", "body")
        assert_error(api.post("/projects", token=admin), 400, "VALIDATION_ERROR", "body")

    def test_duplicate_name_is_case_insensitive(self, api, admin):
        create_project(api, admin, name="Apollo CRM")
        error = assert_error(
            api.post("/projects", token=admin, body=project_body(name=" apollo crm ")), 409, "CONFLICT"
        )
        assert set(error["details"]) == {"name"}

    def test_unknown_and_computed_fields_are_ignored(self, api, admin):
        body = project_body(id=99, health="overdue", progress_percent=100, created_at="2000-01-01", extra="x")
        project = api.post("/projects", token=admin, body=body).body
        assert project["id"] == 1 and project["health"] == "on_track" and project["progress_percent"] == 0
        assert "extra" not in project and not project["created_at"].startswith("2000")


class TestRead:
    def test_get_by_id(self, api, admin, tokens):
        created = create_project(api, admin)
        result = api.get(f"/projects/{created['id']}", token=tokens["viewer"])
        assert result.status == 200 and result.body == created

    def test_unknown_id_is_404(self, api, admin):
        assert_error(api.get("/projects/999", token=admin), 404, "NOT_FOUND")

    def test_invalid_id_is_400(self, api, admin):
        assert_error(api.get("/projects/abc", token=admin), 400, "VALIDATION_ERROR", "id")


class TestList:
    def test_empty(self, api, admin):
        assert api.get("/projects", token=admin).body == {"items": [], "total": 0}

    def test_sorted_by_end_date_then_name(self, api, admin):
        create_project(api, admin, name="beta", end_date="2026-12-31")
        create_project(api, admin, name="Zeta", end_date="2026-12-31")
        create_project(api, admin, name="Gamma", end_date="2026-08-01")
        create_project(api, admin, name="alpha", end_date="2026-12-31")
        result = api.get("/projects", token=admin)
        assert names(result) == ["Gamma", "alpha", "beta", "Zeta"]
        assert all(set(item) == PROJECT_FIELDS for item in result.body["items"])

    @pytest.mark.parametrize(
        "term, expected",
        [
            ("apollo", ["Apollo CRM"]),
            ("PORTAL", ["Apollo CRM"]),
            ("financ", ["Ledger"]),
            ("50%", ["Ledger"]),
            ("nothing-matches", []),
        ],
    )
    def test_search_covers_name_description_and_department(self, api, admin, term, expected):
        create_project(api, admin, name="Apollo CRM", description="Customer portal", department="Sales")
        create_project(api, admin, name="Ledger", description="Cut costs by 50%", department="Finance")
        create_project(api, admin, name="Atlas", description="Phase 500", department="IT")
        assert names(api.get("/projects", token=admin, query={"search": term})) == expected

    def test_filter_by_status(self, api, admin):
        create_project(api, admin, name="Running", status="active")
        create_project(api, admin, name="Later", status="planned")
        assert names(api.get("/projects", token=admin, query={"status": "planned"})) == ["Later"]

    def test_filter_by_department_is_exact_and_case_insensitive(self, api, admin):
        create_project(api, admin, name="Core", department="IT")
        create_project(api, admin, name="Ops", department="IT Operations")
        assert names(api.get("/projects", token=admin, query={"department": " it "})) == ["Core"]

    def test_filter_by_computed_health(self, api, admin, db_conn):
        create_project(api, admin, name="Fine")
        late = create_project(api, admin, name="Late deliverable")
        add_deliverable(db_conn, late["id"], "Spec", due_date=date(2026, 6, 1))
        create_project(api, admin, name="Past end", start_date="2026-01-01", end_date="2026-06-01")
        create_project(api, admin, name="Closed", status="completed", start_date="2026-01-01", end_date="2026-06-01")
        assert names(api.get("/projects", token=admin, query={"health": "on_track"})) == ["Fine"]
        assert names(api.get("/projects", token=admin, query={"health": "at_risk"})) == ["Late deliverable"]
        assert names(api.get("/projects", token=admin, query={"health": "overdue"})) == ["Past end"]

    @pytest.mark.parametrize(
        "health, expected",
        [
            # one value as a plain string: a whole value, not a set of characters ("on_track" is not in "at_risk")
            ("at_risk", ["Late deliverable"]),
            ("overdue", ["Past end"]),
            (("at_risk", "overdue"), ["Past end", "Late deliverable"]),
            (["on_track"], ["Fine"]),
        ],
    )
    def test_service_takes_one_health_value_or_several(self, api, admin, db_conn, health, expected):
        create_project(api, admin, name="Fine")
        late = create_project(api, admin, name="Late deliverable")
        add_deliverable(db_conn, late["id"], "Spec", due_date=date(2026, 6, 1))
        create_project(api, admin, name="Past end", start_date="2026-01-01", end_date="2026-06-01")
        # a closed project has no health (None): it must be left out, not break the filter
        create_project(api, admin, name="Closed", status="completed", start_date="2026-01-01", end_date="2026-06-01")
        listed = service.list_projects(db_conn, health=health)
        assert [item["name"] for item in listed["items"]] == expected

    @pytest.mark.parametrize(
        "health, expected",
        [
            # the union, still sorted by end date, then name (the order of the values does not matter)
            ("at_risk,overdue", ["Past end", "Late deliverable"]),
            ("overdue,at_risk", ["Past end", "Late deliverable"]),
            (" at_risk , overdue,,at_risk ", ["Past end", "Late deliverable"]),
            ("on_track,at_risk", ["Fine", "Late deliverable"]),
            # all three values: every project that has a health; closed projects have none
            ("on_track,at_risk,overdue", ["Past end", "Fine", "Late deliverable"]),
            ("at_risk", ["Late deliverable"]),
        ],
    )
    def test_filter_by_several_health_values(self, api, admin, db_conn, health, expected):
        create_project(api, admin, name="Fine")
        late = create_project(api, admin, name="Late deliverable")
        add_deliverable(db_conn, late["id"], "Spec", due_date=date(2026, 6, 1))
        create_project(api, admin, name="Past end", start_date="2026-01-01", end_date="2026-06-01")
        create_project(api, admin, name="Closed", status="completed", start_date="2026-01-01", end_date="2026-06-01")
        assert names(api.get("/projects", token=admin, query={"health": health})) == expected
        assert names(api.get("/projects", token=admin)) == ["Closed", "Past end", "Fine", "Late deliverable"]

    def test_health_filter_combines_with_the_other_filters(self, api, admin, db_conn):
        for name, department in (("Sales late", "Sales"), ("IT late", "IT")):
            project = create_project(api, admin, name=name, department=department)
            add_deliverable(db_conn, project["id"], "Spec", due_date=date(2026, 6, 1))
        create_project(
            api, admin, name="Sales past end", department="Sales", start_date="2026-01-01", end_date="2026-06-01"
        )
        create_project(api, admin, name="Sales fine", department="Sales")
        query = {"health": "at_risk,overdue", "department": "sales", "status": "active"}
        assert names(api.get("/projects", token=admin, query=query)) == ["Sales past end", "Sales late"]

    @pytest.mark.parametrize("health", ["", " ", ",", " , ,"])
    def test_a_health_filter_without_values_is_no_filter(self, api, admin, health):
        create_project(api, admin, name="Fine")
        create_project(api, admin, name="Closed", status="completed", start_date="2026-01-01", end_date="2026-06-01")
        assert names(api.get("/projects", token=admin, query={"health": health})) == ["Closed", "Fine"]

    @pytest.mark.parametrize("status", ["completed", "cancelled"])
    def test_a_health_filter_never_returns_closed_projects(self, api, admin, status):
        create_project(api, admin, name="Closed", status=status, start_date="2026-01-01", end_date="2026-06-01")
        query = {"health": "on_track,at_risk,overdue", "status": status}
        assert names(api.get("/projects", token=admin, query=query)) == []
        assert names(api.get("/projects", token=admin, query={"status": status})) == ["Closed"]

    def test_a_repeated_health_parameter_counts_as_the_list(self, api, admin, db_conn):
        """``?health=at_risk&health=overdue``: Lambda Function URLs (and LocalStack) join a repeated
        parameter with commas in ``queryStringParameters``, which is what the API reads."""
        create_project(api, admin, name="Fine")
        late = create_project(api, admin, name="Late deliverable")
        add_deliverable(db_conn, late["id"], "Spec", due_date=date(2026, 6, 1))
        create_project(api, admin, name="Past end", start_date="2026-01-01", end_date="2026-06-01")
        event = make_event("GET", "/projects", token=admin, query={"health": "at_risk,overdue"})
        event["rawQueryString"] = "health=at_risk&health=overdue"
        response = function.handler(event, None)
        assert response["statusCode"] == 200
        assert [item["name"] for item in json.loads(response["body"])["items"]] == ["Past end", "Late deliverable"]

    @pytest.mark.parametrize("health", ["red", "at_risk,red", "at_risk;overdue", "At_Risk"])
    def test_any_unknown_health_value_is_rejected(self, api, admin, health):
        error = assert_error(api.get("/projects", token=admin, query={"health": health}), 400, "VALIDATION_ERROR")
        assert error["details"] == {"health": "Must be one of: on_track, at_risk, overdue"}

    def test_filters_combine(self, api, admin):
        create_project(api, admin, name="Apollo", status="active", department="Sales")
        create_project(api, admin, name="Apollo Next", status="planned", department="Sales")
        create_project(api, admin, name="Apollo Ops", status="planned", department="IT")
        query = {"search": "apollo", "status": "planned", "department": "SALES"}
        assert names(api.get("/projects", token=admin, query=query)) == ["Apollo Next"]

    @pytest.mark.parametrize(
        "query, field",
        [
            ({"status": "done"}, "status"),
            ({"health": "red"}, "health"),
            ({"health": "at_risk,red"}, "health"),
            ({"search": "x" * 201}, "search"),
            ({"department": "x" * 101}, "department"),
        ],
    )
    def test_invalid_filter(self, api, admin, query, field):
        assert_error(api.get("/projects", token=admin, query=query), 400, "VALIDATION_ERROR", field)

    def test_metrics_are_loaded_with_one_query_per_request(self, api, admin, monkeypatch):
        for name in ("A", "B", "C"):
            create_project(api, admin, name=name)
        calls = []
        real_fetch = service.fetch_project_metrics

        def spy(conn, project_ids, **kwargs):
            calls.append(sorted(project_ids))
            return real_fetch(conn, project_ids, **kwargs)

        monkeypatch.setattr(service, "fetch_project_metrics", spy)
        assert names(api.get("/projects", token=admin)) == ["A", "B", "C"]
        assert calls == [[1, 2, 3]]


class TestComputedFields:
    def test_progress_health_budget_and_team(self, api, admin, db_conn):
        project_id = create_project(api, admin, start_date="2026-01-01", end_date="2026-12-31", budget=150000)["id"]
        add_deliverable(db_conn, project_id, "Spec", status="completed", due_date=date(2026, 3, 1), is_key=True)
        add_deliverable(db_conn, project_id, "Design", status="completed", due_date=date(2026, 5, 1))
        add_deliverable(db_conn, project_id, "Build", status="in_progress", due_date=date(2026, 6, 1), is_key=True)
        add_deliverable(db_conn, project_id, "Test", status="blocked", due_date=TODAY)  # due today: not overdue
        for email in ("a@acme.com", "b@acme.com"):
            add_allocation(db_conn, add_resource(db_conn, email), project_id)
        add_expense(db_conn, project_id, Decimal("40000"))
        add_expense(db_conn, project_id, Decimal("21000"))

        project = api.get(f"/projects/{project_id}", token=admin).body
        computed = {
            key: project[key] for key in PROJECT_FIELDS - set(project_body()) - {"id", "created_at", "updated_at"}
        }
        assert computed == {
            "progress_percent": 50,
            "deliverables_total": 4,
            "deliverables_completed": 2,
            "deliverables_overdue": 1,
            "deliverables_blocked": 1,
            "key_deliverables_total": 2,
            "key_deliverables_completed": 1,
            "team_size": 2,
            "health": "at_risk",
            "health_reasons": ["1 deliverable overdue", "1 deliverable blocked"],
            "budget_spent": 61000.0,
            "budget_remaining": 89000.0,
            "budget_used_percent": 40.7,
            "over_budget": False,
        }

    def test_at_risk_when_schedule_slips(self, api, admin):
        # 45% of the schedule has elapsed and nothing is complete -> more than 20 points behind
        project = create_project(api, admin, start_date="2026-01-01", end_date="2026-12-31")
        assert project["health"] == "at_risk"
        assert project["health_reasons"] == ["45% of the schedule has elapsed but only 0% of deliverables are complete"]

    def test_overdue_when_end_date_has_passed(self, api, admin):
        project = create_project(api, admin, start_date="2026-01-01", end_date="2026-06-14")
        assert project["health"] == "overdue"
        assert project["health_reasons"][0] == "End date Jun 14, 2026 has passed"

    @pytest.mark.parametrize("status", ["completed", "cancelled"])
    def test_closed_projects_have_no_health(self, api, admin, status):
        project = create_project(api, admin, status=status, start_date="2026-01-01", end_date="2026-02-01")
        assert (project["health"], project["health_reasons"]) == (None, [])

    def test_over_budget(self, api, admin, db_conn):
        project_id = create_project(api, admin, budget=100)["id"]
        add_expense(db_conn, project_id, Decimal("150.25"))
        project = api.get(f"/projects/{project_id}", token=admin).body
        assert (project["budget_spent"], project["budget_remaining"]) == (150.25, -50.25)
        assert (project["budget_used_percent"], project["over_budget"]) == (150.3, True)

    def test_spending_against_a_zero_budget(self, api, admin, db_conn):
        project_id = create_project(api, admin, budget=0)["id"]
        add_expense(db_conn, project_id, Decimal("10"))
        project = api.get(f"/projects/{project_id}", token=admin).body
        assert (project["budget_used_percent"], project["over_budget"]) == (None, True)


class TestUpdate:
    def test_full_update(self, api, tokens, db_conn):
        project = create_project(api, tokens["admin"])
        db_conn.execute("UPDATE projects SET updated_at = '2020-01-01T00:00:00Z' WHERE id = %s", (project["id"],))
        body = project_body(
            name=" Apollo CRM v2 ",
            description="",
            department="IT",
            status="on_hold",
            start_date="2026-08-01",
            end_date="2027-03-31",
            budget=99.99,
        )
        result = api.put(f"/projects/{project['id']}", token=tokens["admin"], body=body)
        assert result.status == 200
        assert {key: result.body[key] for key in project_body()} == {**body, "name": "Apollo CRM v2"}
        assert result.body["created_at"] == project["created_at"]

        row = db_conn.execute("SELECT * FROM projects WHERE id = %s", (project["id"],)).fetchone()
        assert (row["name"], row["status"], row["budget"]) == ("Apollo CRM v2", "on_hold", Decimal("99.99"))
        assert row["end_date"] == date(2027, 3, 31)
        assert row["updated_at"] > datetime(2020, 1, 2, tzinfo=UTC)

    def test_omitted_optional_fields_reset_to_defaults(self, api, admin):
        project = create_project(api, admin, description="Something", budget=500)
        body = {"name": "Apollo CRM", "department": "Sales", "start_date": "2026-07-01", "end_date": "2026-12-31"}
        updated = api.put(f"/projects/{project['id']}", token=admin, body=body).body
        assert (updated["description"], updated["status"], updated["budget"]) == ("", "planned", 0.0)

    def test_a_received_object_can_be_sent_back(self, api, admin):
        project = create_project(api, admin)
        result = api.put(f"/projects/{project['id']}", token=admin, body={**project, "status": "completed"})
        assert result.status == 200
        assert (result.body["status"], result.body["health"]) == ("completed", None)

    def test_keeping_its_own_name_in_another_case(self, api, admin):
        project = create_project(api, admin, name="Apollo CRM")
        result = api.put(f"/projects/{project['id']}", token=admin, body=project_body(name="APOLLO crm"))
        assert result.status == 200 and result.body["name"] == "APOLLO crm"

    def test_renaming_to_an_existing_name_is_a_conflict(self, api, admin):
        create_project(api, admin, name="Apollo CRM")
        other = create_project(api, admin, name="Zeus")
        result = api.put(f"/projects/{other['id']}", token=admin, body=project_body(name="apollo CRM"))
        assert_error(result, 409, "CONFLICT", "name")

    def test_validation_rules_apply(self, api, admin):
        project = create_project(api, admin)
        result = api.put(f"/projects/{project['id']}", token=admin, body=project_body(end_date="2026-01-01"))
        assert assert_error(result, 400, "VALIDATION_ERROR")["details"] == {
            "end_date": "Must be on or after start_date"
        }
        assert_error(api.put(f"/projects/{project['id']}", token=admin, raw_body="nope"), 400, "INVALID_JSON")

    def test_unknown_id_is_404(self, api, admin):
        create_project(api, admin, name="Apollo CRM")  # the URL id is checked before the name (404, not 409)
        assert_error(api.put("/projects/999", token=admin, body=project_body(name="Apollo CRM")), 404, "NOT_FOUND")

    def test_project_deleted_by_a_concurrent_request_is_404(self, api, admin, monkeypatch):
        project = create_project(api, admin)
        real_name_taken = repository.name_taken

        def deleted_meanwhile(conn, name, **kwargs):
            """Runs between the existence check and the UPDATE, like a DELETE committed by another user."""
            conn.execute("DELETE FROM projects WHERE id = %s", (project["id"],))
            return real_name_taken(conn, name, **kwargs)

        monkeypatch.setattr(repository, "name_taken", deleted_meanwhile)
        result = api.put(f"/projects/{project['id']}", token=admin, body=project_body(name="Renamed"))
        assert_error(result, 404, "NOT_FOUND")


class TestDelete:
    def test_delete_cascades_to_related_records(self, api, admin, db_conn):
        project_id = create_project(api, admin, name="Doomed")["id"]
        survivor_id = create_project(api, admin, name="Survivor")["id"]
        first = add_deliverable(db_conn, project_id, "First")
        second = add_deliverable(db_conn, project_id, "Second")
        outside = add_deliverable(db_conn, survivor_id, "Outside")
        db_conn.execute(
            "INSERT INTO deliverable_dependencies (deliverable_id, depends_on_id) VALUES (%s, %s), (%s, %s)",
            (second, first, outside, first),
        )
        add_allocation(db_conn, add_resource(db_conn, "a@acme.com"), project_id)
        add_expense(db_conn, project_id, Decimal("5"))

        result = api.delete(f"/projects/{project_id}", token=admin)
        assert result.status == 204 and result.raw == ""
        assert_error(api.get(f"/projects/{project_id}", token=admin), 404, "NOT_FOUND")
        remaining = db_conn.execute(
            """SELECT (SELECT array_agg(id) FROM deliverables) AS deliverables,
                      (SELECT COUNT(*) FROM deliverable_dependencies) AS links,
                      (SELECT COUNT(*) FROM allocations) AS allocations,
                      (SELECT COUNT(*) FROM expenses) AS expenses,
                      (SELECT COUNT(*) FROM resources) AS resources"""
        ).fetchone()
        assert remaining == {"deliverables": [outside], "links": 0, "allocations": 0, "expenses": 0, "resources": 1}

    def test_unknown_id_is_404(self, api, admin):
        assert_error(api.delete("/projects/999", token=admin), 404, "NOT_FOUND")


ENDPOINTS = [
    ("GET", "/projects"),
    ("POST", "/projects"),
    ("GET", "/projects/1"),
    ("PUT", "/projects/1"),
    ("DELETE", "/projects/1"),
]
WRITE_PERMISSIONS = [
    ("POST", "/projects", "projects:create"),
    ("PUT", "/projects/1", "projects:update"),
    ("DELETE", "/projects/1", "projects:delete"),
]


class TestPermissions:
    @pytest.mark.parametrize("method, path", ENDPOINTS)
    def test_token_required(self, api, method, path):
        assert_error(api.request(method, path, body=project_body()), 401, "AUTH_REQUIRED")

    @pytest.mark.parametrize("method, path, permission", WRITE_PERMISSIONS)
    def test_viewer_cannot_write(self, api, tokens, method, path, permission):
        create_project(api, tokens["admin"])
        result = api.request(method, path, token=tokens["viewer"], body=project_body(name="Other"))
        assert assert_error(result, 403, "FORBIDDEN")["details"] == {"required_permission": permission}
        assert names(api.get("/projects", token=tokens["viewer"])) == ["Apollo CRM"]  # nothing written

    def test_viewer_can_read(self, api, tokens):
        project = create_project(api, tokens["admin"])
        assert api.get("/projects", token=tokens["viewer"]).status == 200
        assert api.get(f"/projects/{project['id']}", token=tokens["viewer"]).status == 200

    def test_contributor_can_create_and_update_but_not_delete(self, api, tokens):
        project = create_project(api, tokens["contributor"])
        path = f"/projects/{project['id']}"
        assert api.put(path, token=tokens["contributor"], body=project_body(name="Renamed")).status == 200
        result = api.delete(path, token=tokens["contributor"])
        assert assert_error(result, 403, "FORBIDDEN")["details"] == {"required_permission": "projects:delete"}
        assert api.get(path, token=tokens["contributor"]).status == 200

    @pytest.mark.parametrize("role", ["manager", "admin"])
    def test_manager_and_admin_have_full_access(self, api, tokens, role):
        project = create_project(api, tokens[role])
        path = f"/projects/{project['id']}"
        assert api.put(path, token=tokens[role], body=project_body(name="Renamed")).status == 200
        assert api.delete(path, token=tokens[role]).status == 204
