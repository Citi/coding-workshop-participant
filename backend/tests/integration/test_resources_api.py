"""Integration tests: /resources endpoints (CRUD, filters, utilization, RBAC) on a real database.

Projects, deliverables and allocations are arranged with direct SQL so these tests only
exercise the resources endpoints.
"""

from datetime import UTC, datetime

import pytest
from psycopg import sql

from app.resources import repository
from helpers import assert_error

BODY = {"full_name": "Priya Shah", "email": "priya@acme.com", "job_title": "Developer", "department": "IT"}
RESOURCE_FIELDS = {
    "id",
    "full_name",
    "email",
    "job_title",
    "department",
    "total_allocation_percent",
    "active_project_count",
    "is_over_allocated",
    "created_at",
    "updated_at",
}
ALLOCATION_SUMMARY_FIELDS = {"id", "project_id", "project_name", "project_status", "allocation_percent"}
PAST = datetime(2020, 1, 1, tzinfo=UTC)


def add_project(db_conn, name, status="active"):
    return db_conn.execute(
        "INSERT INTO projects (name, department, status, start_date, end_date)"
        " VALUES (%s, 'IT', %s, '2026-01-01', '2026-12-31') RETURNING id",
        (name, status),
    ).fetchone()["id"]


def add_resource(db_conn, full_name="Priya Shah", email="priya@acme.com", job_title="Developer", department="IT"):
    return db_conn.execute(
        "INSERT INTO resources (full_name, email, job_title, department) VALUES (%s, %s, %s, %s) RETURNING id",
        (full_name, email, job_title, department),
    ).fetchone()["id"]


def allocate(db_conn, resource_id, project_id, percent):
    db_conn.execute(
        "INSERT INTO allocations (resource_id, project_id, allocation_percent) VALUES (%s, %s, %s)",
        (resource_id, project_id, percent),
    )


def names(result):
    return [item["full_name"] for item in result.body["items"]]


def count_rows(db_conn, table):
    return db_conn.execute(sql.SQL("SELECT COUNT(*) AS n FROM {}").format(sql.Identifier(table))).fetchone()["n"]


class TestCreateResource:
    def test_creates_resource_with_trimmed_values_and_zero_utilization(self, api, tokens, db_conn):
        body = {
            "full_name": "  Priya Shah ",
            "email": " Priya@ACME.com ",
            "job_title": " Developer ",
            "department": " IT ",
        }
        result = api.post("/resources", token=tokens["manager"], body=body)
        assert result.status == 201
        assert set(result.body) == RESOURCE_FIELDS
        assert {key: result.body[key] for key in BODY} == BODY
        assert (result.body["total_allocation_percent"], result.body["active_project_count"]) == (0, 0)
        assert result.body["is_over_allocated"] is False
        stored = db_conn.execute(
            "SELECT full_name, email, job_title, department FROM resources WHERE id = %s", (result.body["id"],)
        ).fetchone()
        assert stored == BODY

    def test_ignores_unknown_and_computed_fields(self, api, tokens):
        body = {**BODY, "id": 99, "total_allocation_percent": 500, "is_over_allocated": True, "extra": "x"}
        result = api.post("/resources", token=tokens["admin"], body=body)
        assert result.status == 201
        assert result.body["id"] == 1 and result.body["total_allocation_percent"] == 0
        assert "extra" not in result.body

    def test_accepts_maximum_lengths(self, api, tokens):
        body = {
            "full_name": "n" * 120,
            "email": "a" * 243 + "@example.com",
            "job_title": "j" * 100,
            "department": "d" * 100,
        }
        result = api.post("/resources", token=tokens["admin"], body=body)
        assert result.status == 201 and result.body["email"] == body["email"]

    @pytest.mark.parametrize("field", list(BODY))
    def test_every_field_is_required(self, api, tokens, field):
        body = {key: value for key, value in BODY.items() if key != field}
        error = assert_error(api.post("/resources", token=tokens["admin"], body=body), 400, "VALIDATION_ERROR", field)
        assert error["details"][field] == "This field is required"

    @pytest.mark.parametrize(
        "field, value",
        [
            ("full_name", "   "),
            ("full_name", "x" * 121),
            ("full_name", 42),
            ("email", "not-an-email"),
            ("email", "priya@acme"),
            ("email", "a" * 244 + "@example.com"),
            ("job_title", ""),
            ("job_title", "x" * 101),
            ("department", " "),
            ("department", "x" * 101),
        ],
    )
    def test_invalid_values_are_rejected_per_field(self, api, tokens, db_conn, field, value):
        result = api.post("/resources", token=tokens["admin"], body={**BODY, field: value})
        assert_error(result, 400, "VALIDATION_ERROR", field)
        assert count_rows(db_conn, "resources") == 0

    def test_duplicate_email_is_a_conflict_regardless_of_case(self, api, tokens, db_conn):
        add_resource(db_conn, email="priya@acme.com")
        result = api.post("/resources", token=tokens["admin"], body={**BODY, "email": " PRIYA@Acme.com"})
        assert_error(result, 409, "CONFLICT", "email")
        assert count_rows(db_conn, "resources") == 1

    def test_malformed_json(self, api, tokens):
        assert_error(api.post("/resources", token=tokens["admin"], raw_body="{oops"), 400, "INVALID_JSON")

    @pytest.mark.parametrize("raw_body", [None, "[1, 2]", '"text"'])
    def test_body_must_be_a_json_object(self, api, tokens, raw_body):
        assert_error(api.post("/resources", token=tokens["admin"], raw_body=raw_body), 400, "VALIDATION_ERROR", "body")


class TestListResources:
    def test_sorted_by_full_name_ignoring_case(self, api, tokens, db_conn):
        for full_name in ("Carla Diaz", "aaron smith", "Bella Jones"):
            add_resource(db_conn, full_name, f"{full_name.split()[0].lower()}@acme.com")
        result = api.get("/resources", token=tokens["viewer"])
        assert result.status == 200
        assert names(result) == ["aaron smith", "Bella Jones", "Carla Diaz"]
        assert result.body["total"] == 3
        assert set(result.body["items"][0]) == RESOURCE_FIELDS

    def test_empty_list(self, api, tokens):
        assert api.get("/resources", token=tokens["viewer"]).body == {"items": [], "total": 0}

    @pytest.mark.parametrize(
        "term, expected",
        [
            ("PRIYA", ["Priya Shah"]),  # name, case-insensitive
            ("@globex", ["Omar Haddad"]),  # email
            ("design", ["Lena Fischer"]),  # job title
            ("finance", []),  # department is not searched
            ("nobody", []),
        ],
    )
    def test_search_matches_name_email_or_job_title(self, api, tokens, db_conn, term, expected):
        add_resource(db_conn, "Priya Shah", "priya@acme.com", "Developer", "IT")
        add_resource(db_conn, "Omar Haddad", "omar@globex.com", "Analyst", "Finance")
        add_resource(db_conn, "Lena Fischer", "lena@acme.com", "UX Designer", "Product")
        result = api.get("/resources", token=tokens["viewer"], query={"search": term})
        assert names(result) == expected and result.body["total"] == len(expected)

    def test_search_treats_like_wildcards_literally(self, api, tokens, db_conn):
        add_resource(db_conn, "Ann Lee", "ann@acme.com", "QA_Lead")
        add_resource(db_conn, "Ben Ng", "ben@acme.com", "QAxLead")
        assert names(api.get("/resources", token=tokens["viewer"], query={"search": "qa_"})) == ["Ann Lee"]
        assert names(api.get("/resources", token=tokens["viewer"], query={"search": "%"})) == []

    def test_department_filter_is_exact_and_case_insensitive(self, api, tokens, db_conn):
        add_resource(db_conn, "Priya Shah", "priya@acme.com", department="IT")
        add_resource(db_conn, "Omar Haddad", "omar@acme.com", department="IT Ops")
        assert names(api.get("/resources", token=tokens["viewer"], query={"department": " it "})) == ["Priya Shah"]

    def test_over_allocated_filter(self, api, tokens, db_conn):
        busy = add_resource(db_conn, "Priya Shah", "priya@acme.com")
        full = add_resource(db_conn, "Omar Haddad", "omar@acme.com")
        add_resource(db_conn, "Lena Fischer", "lena@acme.com")
        apollo, zeus = add_project(db_conn, "Apollo CRM"), add_project(db_conn, "Zeus Portal")
        allocate(db_conn, busy, apollo, 80)
        allocate(db_conn, busy, zeus, 40)
        allocate(db_conn, full, apollo, 100)

        over = api.get("/resources", token=tokens["viewer"], query={"over_allocated": "true"})
        assert names(over) == ["Priya Shah"] and over.body["total"] == 1
        assert over.body["items"][0]["total_allocation_percent"] == 120
        assert over.body["items"][0]["active_project_count"] == 2
        assert names(api.get("/resources", token=tokens["viewer"], query={"over_allocated": False})) == [
            "Lena Fischer",
            "Omar Haddad",
        ]

    def test_filters_combine(self, api, tokens, db_conn):
        add_resource(db_conn, "Priya Shah", "priya@acme.com", "Developer", "IT")
        add_resource(db_conn, "Paul Smith", "paul@acme.com", "Developer", "Finance")
        query = {"search": "developer", "department": "finance", "over_allocated": "false"}
        assert names(api.get("/resources", token=tokens["viewer"], query=query)) == ["Paul Smith"]

    def test_invalid_over_allocated_value(self, api, tokens):
        result = api.get("/resources", token=tokens["viewer"], query={"over_allocated": "maybe"})
        assert_error(result, 400, "VALIDATION_ERROR", "over_allocated")

    def test_department_filter_longer_than_the_column_is_rejected(self, api, tokens):
        result = api.get("/resources", token=tokens["viewer"], query={"department": "d" * 101})
        assert_error(result, 400, "VALIDATION_ERROR", "department")  # same limit as GET /projects


class TestGetResource:
    def test_includes_every_allocation_sorted_by_project_name(self, api, tokens, db_conn):
        priya = add_resource(db_conn)
        zeus = add_project(db_conn, "Zeus Portal", "planned")
        apollo = add_project(db_conn, "Apollo CRM", "active")
        hermes = add_project(db_conn, "Hermes Billing", "completed")
        for project_id, percent in ((zeus, 30), (apollo, 60), (hermes, 20)):
            allocate(db_conn, priya, project_id, percent)
        allocate(db_conn, add_resource(db_conn, "Omar Haddad", "omar@acme.com"), apollo, 50)  # someone else's

        result = api.get(f"/resources/{priya}", token=tokens["viewer"])
        assert result.status == 200
        assert set(result.body) == RESOURCE_FIELDS | {"allocations"}
        assert (result.body["total_allocation_percent"], result.body["active_project_count"]) == (60, 1)
        allocations = result.body["allocations"]
        assert [(a["project_name"], a["project_status"], a["allocation_percent"]) for a in allocations] == [
            ("Apollo CRM", "active", 60),
            ("Hermes Billing", "completed", 20),
            ("Zeus Portal", "planned", 30),
        ]
        assert set(allocations[0]) == ALLOCATION_SUMMARY_FIELDS and allocations[0]["project_id"] == apollo

    def test_resource_without_allocations(self, api, tokens, db_conn):
        body = api.get(f"/resources/{add_resource(db_conn)}", token=tokens["viewer"]).body
        assert body["allocations"] == [] and body["email"] == "priya@acme.com"

    def test_unknown_resource_is_404(self, api, tokens):
        assert_error(api.get("/resources/999", token=tokens["viewer"]), 404, "NOT_FOUND")

    def test_invalid_id_is_400(self, api, tokens):
        assert_error(api.get("/resources/abc", token=tokens["viewer"]), 400, "VALIDATION_ERROR", "id")


class TestUpdateResource:
    def test_full_update_is_persisted(self, api, tokens, db_conn):
        priya = add_resource(db_conn)
        db_conn.execute("UPDATE resources SET created_at = %s, updated_at = %s WHERE id = %s", (PAST, PAST, priya))
        body = {
            "full_name": " Priya S. Shah ",
            "email": "PRIYA.SHAH@acme.com",
            "job_title": "Lead",
            "department": "R&D",
        }
        result = api.put(f"/resources/{priya}", token=tokens["contributor"], body=body)
        expected = {
            "full_name": "Priya S. Shah",
            "email": "priya.shah@acme.com",
            "job_title": "Lead",
            "department": "R&D",
        }
        assert result.status == 200
        assert set(result.body) == RESOURCE_FIELDS and {key: result.body[key] for key in expected} == expected
        stored = db_conn.execute(
            "SELECT full_name, email, job_title, department, created_at, updated_at FROM resources WHERE id = %s",
            (priya,),
        ).fetchone()
        assert {key: stored[key] for key in expected} == expected
        assert stored["created_at"] == PAST and stored["updated_at"] > PAST

    def test_response_carries_current_utilization(self, api, tokens, db_conn):
        priya = add_resource(db_conn)
        allocate(db_conn, priya, add_project(db_conn, "Apollo CRM"), 100)
        allocate(db_conn, priya, add_project(db_conn, "Zeus Portal"), 10)
        body = api.put(f"/resources/{priya}", token=tokens["manager"], body=BODY).body
        assert (body["total_allocation_percent"], body["active_project_count"], body["is_over_allocated"]) == (
            110,
            2,
            True,
        )

    def test_keeping_own_email_in_another_case_is_allowed(self, api, tokens, db_conn):
        priya = add_resource(db_conn, email="priya@acme.com")
        result = api.put(f"/resources/{priya}", token=tokens["manager"], body={**BODY, "email": "PRIYA@ACME.COM"})
        assert result.status == 200 and result.body["email"] == "priya@acme.com"

    def test_email_of_another_resource_is_a_conflict(self, api, tokens, db_conn):
        add_resource(db_conn, "Omar Haddad", "omar@acme.com")
        priya = add_resource(db_conn)
        result = api.put(f"/resources/{priya}", token=tokens["manager"], body={**BODY, "email": "Omar@acme.com"})
        assert_error(result, 409, "CONFLICT", "email")
        assert (
            db_conn.execute("SELECT email FROM resources WHERE id = %s", (priya,)).fetchone()["email"]
            == "priya@acme.com"
        )

    def test_put_is_a_full_update(self, api, tokens, db_conn):
        priya = add_resource(db_conn)
        result = api.put(f"/resources/{priya}", token=tokens["manager"], body={"full_name": "New"})
        error = assert_error(result, 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"email", "job_title", "department"}

    @pytest.mark.parametrize(
        "field, value", [("full_name", " "), ("email", "nope"), ("job_title", "x" * 101), ("department", None)]
    )
    def test_invalid_values_leave_the_resource_unchanged(self, api, tokens, db_conn, field, value):
        priya = add_resource(db_conn)
        result = api.put(
            f"/resources/{priya}", token=tokens["manager"], body={**BODY, "full_name": "Changed", field: value}
        )
        assert_error(result, 400, "VALIDATION_ERROR", field)
        assert (
            db_conn.execute("SELECT full_name FROM resources WHERE id = %s", (priya,)).fetchone()["full_name"]
            == "Priya Shah"
        )

    def test_unknown_resource_is_404(self, api, tokens):
        assert_error(api.put("/resources/999", token=tokens["manager"], body=BODY), 404, "NOT_FOUND")

    def test_resource_deleted_by_another_request_during_the_update_is_404(self, api, tokens, db_conn, monkeypatch):
        priya = add_resource(db_conn)
        email_taken = repository.email_taken

        def deleted_meanwhile(conn, email, **kwargs):
            """Simulates a concurrent DELETE landing between the existence check and the UPDATE."""
            conn.execute("DELETE FROM resources WHERE id = %s", (priya,))
            return email_taken(conn, email, **kwargs)

        monkeypatch.setattr(repository, "email_taken", deleted_meanwhile)
        assert_error(api.put(f"/resources/{priya}", token=tokens["manager"], body=BODY), 404, "NOT_FOUND")

    def test_malformed_json(self, api, tokens, db_conn):
        priya = add_resource(db_conn)
        assert_error(api.put(f"/resources/{priya}", token=tokens["manager"], raw_body="{"), 400, "INVALID_JSON")


class TestDeleteResource:
    def test_removes_allocations_and_clears_deliverable_owner(self, api, tokens, db_conn):
        priya = add_resource(db_conn)
        apollo = add_project(db_conn, "Apollo CRM")
        allocate(db_conn, priya, apollo, 50)
        deliverable = db_conn.execute(
            "INSERT INTO deliverables (project_id, name, due_date, owner_id)"
            " VALUES (%s, 'Spec', '2026-03-01', %s) RETURNING id",
            (apollo, priya),
        ).fetchone()["id"]

        result = api.delete(f"/resources/{priya}", token=tokens["manager"])
        assert result.status == 204 and result.raw == ""
        assert count_rows(db_conn, "resources") == 0 and count_rows(db_conn, "allocations") == 0
        owner = db_conn.execute("SELECT owner_id FROM deliverables WHERE id = %s", (deliverable,)).fetchone()
        assert owner["owner_id"] is None
        assert_error(api.get(f"/resources/{priya}", token=tokens["manager"]), 404, "NOT_FOUND")

    def test_unknown_resource_is_404(self, api, tokens):
        assert_error(api.delete("/resources/999", token=tokens["admin"]), 404, "NOT_FOUND")


class TestUtilization:
    def test_only_active_projects_count(self, api, tokens, db_conn):
        priya = add_resource(db_conn)
        projects = [
            ("A", "active", 60),
            ("B", "active", 30),
            ("C", "planned", 50),
            ("D", "on_hold", 40),
            ("E", "completed", 70),
            ("F", "cancelled", 80),
        ]
        for name, status, percent in projects:
            allocate(db_conn, priya, add_project(db_conn, name, status), percent)
        body = api.get(f"/resources/{priya}", token=tokens["viewer"]).body
        assert (body["total_allocation_percent"], body["active_project_count"], body["is_over_allocated"]) == (
            90,
            2,
            False,
        )
        assert len(body["allocations"]) == len(projects)

    @pytest.mark.parametrize("percents, over_allocated", [((60, 40), False), ((60, 41), True)])
    def test_over_allocated_only_above_100_percent(self, api, tokens, db_conn, percents, over_allocated):
        priya = add_resource(db_conn)
        for index, percent in enumerate(percents):
            allocate(db_conn, priya, add_project(db_conn, f"Project {index}"), percent)
        item = api.get("/resources", token=tokens["viewer"]).body["items"][0]
        assert item["total_allocation_percent"] == sum(percents) and item["is_over_allocated"] is over_allocated

    def test_project_status_change_is_reflected(self, api, tokens, db_conn):
        priya = add_resource(db_conn)
        apollo, zeus = add_project(db_conn, "Apollo CRM"), add_project(db_conn, "Zeus Portal")
        allocate(db_conn, priya, apollo, 70)
        allocate(db_conn, priya, zeus, 50)
        assert api.get(f"/resources/{priya}", token=tokens["viewer"]).body["is_over_allocated"] is True
        db_conn.execute("UPDATE projects SET status = 'on_hold' WHERE id = %s", (apollo,))
        body = api.get(f"/resources/{priya}", token=tokens["viewer"]).body
        assert (body["total_allocation_percent"], body["active_project_count"], body["is_over_allocated"]) == (
            50,
            1,
            False,
        )
        assert [a["project_status"] for a in body["allocations"]] == ["on_hold", "active"]


# RBAC: action -> (method, path, permission, status when allowed)
ACTIONS = {
    "list": ("GET", "/resources", "resources:read", 200),
    "get": ("GET", "/resources/{id}", "resources:read", 200),
    "create": ("POST", "/resources", "resources:create", 201),
    "update": ("PUT", "/resources/{id}", "resources:update", 200),
    "delete": ("DELETE", "/resources/{id}", "resources:delete", 204),
}
ALLOWED = {
    "admin": set(ACTIONS),
    "manager": set(ACTIONS),
    "contributor": {"list", "get", "create", "update"},
    "viewer": {"list", "get"},
}


class TestPermissions:
    def _call(self, api, db_conn, action, token):
        resource_id = add_resource(db_conn, "Omar Haddad", "omar@acme.com")
        method, path, _, _ = ACTIONS[action]
        body = BODY if method in ("POST", "PUT") else None
        return api.request(method, path.format(id=resource_id), token=token, body=body)

    @pytest.mark.parametrize("action", list(ACTIONS))
    def test_requires_authentication(self, api, db_conn, action):
        assert_error(self._call(api, db_conn, action, None), 401, "AUTH_REQUIRED")

    @pytest.mark.parametrize("role, action", [(role, action) for role in ALLOWED for action in ACTIONS])
    def test_role_permissions(self, api, tokens, db_conn, role, action):
        result = self._call(api, db_conn, action, tokens[role])
        _, _, permission, allowed_status = ACTIONS[action]
        if action in ALLOWED[role]:
            assert result.status == allowed_status, result.body
        else:
            error = assert_error(result, 403, "FORBIDDEN")
            assert error["details"]["required_permission"] == permission
            stored = db_conn.execute("SELECT full_name, email FROM resources").fetchall()
            assert stored == [{"full_name": "Omar Haddad", "email": "omar@acme.com"}]  # nothing changed
