"""Integration tests: /allocations endpoints (CRUD, validation, utilization totals, RBAC).

Projects and resources are arranged with direct SQL so these tests only exercise the
allocations endpoints.
"""

from datetime import UTC, datetime

import pytest

from app.allocations.service import enrich_allocation
from helpers import assert_error

ALLOCATION_FIELDS = {
    "id",
    "resource_id",
    "resource_name",
    "project_id",
    "project_name",
    "project_status",
    "allocation_percent",
    "resource_total_allocation_percent",
    "resource_over_allocated",
    "created_at",
    "updated_at",
}
PAST = datetime(2020, 1, 1, tzinfo=UTC)


def add_project(db_conn, name, status="active"):
    return db_conn.execute(
        "INSERT INTO projects (name, department, status, start_date, end_date)"
        " VALUES (%s, 'IT', %s, '2026-01-01', '2026-12-31') RETURNING id",
        (name, status),
    ).fetchone()["id"]


def add_resource(db_conn, full_name, email):
    return db_conn.execute(
        "INSERT INTO resources (full_name, email, job_title, department)"
        " VALUES (%s, %s, 'Developer', 'IT') RETURNING id",
        (full_name, email),
    ).fetchone()["id"]


def allocate(db_conn, resource_id, project_id, percent):
    return db_conn.execute(
        "INSERT INTO allocations (resource_id, project_id, allocation_percent) VALUES (%s, %s, %s) RETURNING id",
        (resource_id, project_id, percent),
    ).fetchone()["id"]


def allocation_body(resource_id, project_id, percent=50):
    return {"resource_id": resource_id, "project_id": project_id, "allocation_percent": percent}


def stored(db_conn, allocation_id):
    return db_conn.execute(
        "SELECT resource_id, project_id, allocation_percent, created_at, updated_at FROM allocations WHERE id = %s",
        (allocation_id,),
    ).fetchone()


def count_allocations(db_conn):
    return db_conn.execute("SELECT COUNT(*) AS n FROM allocations").fetchone()["n"]


@pytest.fixture
def priya(db_conn):
    return add_resource(db_conn, "Priya Shah", "priya@acme.com")


@pytest.fixture
def apollo(db_conn):
    return add_project(db_conn, "Apollo CRM")


@pytest.fixture
def post(api, tokens):
    """POST /allocations as a manager."""
    return lambda body=None, **kwargs: api.post("/allocations", token=tokens["manager"], body=body, **kwargs)


@pytest.fixture
def put(api, tokens):
    """PUT /allocations/{id} as a manager."""
    return lambda allocation_id, body=None, **kwargs: api.put(
        f"/allocations/{allocation_id}", token=tokens["manager"], body=body, **kwargs
    )


class TestCreateAllocation:
    def test_creates_allocation_with_names_and_totals(self, api, tokens, db_conn, priya, apollo):
        result = api.post("/allocations", token=tokens["contributor"], body=allocation_body(priya, apollo, 60))
        assert result.status == 201
        assert set(result.body) == ALLOCATION_FIELDS
        assert {key: result.body[key] for key in ALLOCATION_FIELDS - {"id", "created_at", "updated_at"}} == {
            "resource_id": priya,
            "resource_name": "Priya Shah",
            "project_id": apollo,
            "project_name": "Apollo CRM",
            "project_status": "active",
            "allocation_percent": 60,
            "resource_total_allocation_percent": 60,
            "resource_over_allocated": False,
        }
        row = stored(db_conn, result.body["id"])
        assert (row["resource_id"], row["project_id"], row["allocation_percent"]) == (priya, apollo, 60)

    def test_over_allocation_is_allowed_and_reported(self, post, db_conn, priya, apollo):
        allocate(db_conn, priya, add_project(db_conn, "Zeus Portal"), 70)
        result = post(allocation_body(priya, apollo, 50))
        assert result.status == 201
        assert (result.body["resource_total_allocation_percent"], result.body["resource_over_allocated"]) == (120, True)

    @pytest.mark.parametrize("status", ["planned", "on_hold", "completed", "cancelled"])
    def test_allocation_to_a_non_active_project_does_not_count(self, post, db_conn, priya, status):
        allocate(db_conn, priya, add_project(db_conn, "Zeus Portal"), 40)
        body = post(allocation_body(priya, add_project(db_conn, "Hermes Billing", status), 80)).body
        assert body["project_status"] == status
        assert (body["resource_total_allocation_percent"], body["resource_over_allocated"]) == (40, False)

    def test_ignores_unknown_and_computed_fields(self, post, priya, apollo):
        result = post(
            {**allocation_body(priya, apollo, 30), "resource_total_allocation_percent": 999, "project_name": "X"}
        )
        assert result.status == 201
        assert (result.body["project_name"], result.body["resource_total_allocation_percent"]) == ("Apollo CRM", 30)

    @pytest.mark.parametrize("percent", [1, 100])
    def test_boundary_percentages_are_accepted(self, post, priya, apollo, percent):
        result = post(allocation_body(priya, apollo, percent))
        assert result.status == 201 and result.body["allocation_percent"] == percent

    @pytest.mark.parametrize("percent", [0, 101, -5, 50.5, "abc", "", None])
    def test_allocation_percent_must_be_an_integer_from_1_to_100(self, post, db_conn, priya, apollo, percent):
        assert_error(post(allocation_body(priya, apollo, percent)), 400, "VALIDATION_ERROR", "allocation_percent")
        assert count_allocations(db_conn) == 0

    @pytest.mark.parametrize("percent", [True, False, "50", 50.0])
    def test_allocation_percent_must_be_a_json_integer(self, post, db_conn, priya, apollo, percent):
        # Without strict ints pydantic reads true as 1 (a silent 1% allocation) and "50" as 50.
        error = assert_error(
            post(allocation_body(priya, apollo, percent)), 400, "VALIDATION_ERROR", "allocation_percent"
        )
        assert error["details"]["allocation_percent"] == "Must be a whole number"
        assert count_allocations(db_conn) == 0

    def test_every_field_is_required(self, post):
        error = assert_error(post({}), 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"resource_id", "project_id", "allocation_percent"}

    @pytest.mark.parametrize(
        "field, value",
        [
            ("resource_id", 0),
            ("resource_id", "abc"),
            ("resource_id", True),  # would otherwise be read as id 1, which exists here
            ("project_id", -1),
            ("project_id", 2**31),
            ("project_id", "1"),
            ("project_id", 1.0),
        ],
    )
    def test_ids_must_be_positive_integers(self, post, db_conn, priya, apollo, field, value):
        assert (priya, apollo) == (1, 1)
        assert_error(post({**allocation_body(priya, apollo), field: value}), 400, "VALIDATION_ERROR", field)
        assert count_allocations(db_conn) == 0

    def test_unknown_resource(self, post, apollo):
        error = assert_error(post(allocation_body(999, apollo)), 400, "VALIDATION_ERROR", "resource_id")
        assert "project_id" not in error["details"]

    def test_unknown_project(self, post, priya):
        error = assert_error(post(allocation_body(priya, 999)), 400, "VALIDATION_ERROR", "project_id")
        assert "resource_id" not in error["details"]

    def test_unknown_resource_and_project_are_both_reported(self, post):
        error = assert_error(post(allocation_body(998, 999)), 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"resource_id", "project_id"}

    def test_one_allocation_per_resource_and_project(self, post, db_conn, priya, apollo):
        allocate(db_conn, priya, apollo, 30)
        assert_error(post(allocation_body(priya, apollo)), 409, "CONFLICT", "resource_id")
        assert count_allocations(db_conn) == 1

    def test_malformed_json(self, post):
        assert_error(post(raw_body="{"), 400, "INVALID_JSON")

    def test_body_must_be_a_json_object(self, post):
        assert_error(post(raw_body="[]"), 400, "VALIDATION_ERROR", "body")


class TestListAllocations:
    def test_sorted_by_project_then_resource_ignoring_case_with_active_totals(self, api, tokens, db_conn):
        priya = add_resource(db_conn, "Priya Shah", "priya@acme.com")
        omar = add_resource(db_conn, "omar haddad", "omar@acme.com")
        zeus = add_project(db_conn, "Zeus Portal")
        apollo = add_project(db_conn, "Apollo CRM")
        hermes = add_project(db_conn, "hermes billing", "on_hold")
        allocate(db_conn, priya, zeus, 70)
        allocate(db_conn, omar, zeus, 20)
        allocate(db_conn, priya, apollo, 50)
        allocate(db_conn, priya, hermes, 90)  # on hold: listed, but not counted in the totals

        result = api.get("/allocations", token=tokens["viewer"])
        assert result.status == 200 and result.body["total"] == 4
        items = result.body["items"]
        assert set(items[0]) == ALLOCATION_FIELDS
        rows = [
            (
                a["project_name"],
                a["resource_name"],
                a["resource_total_allocation_percent"],
                a["resource_over_allocated"],
            )
            for a in items
        ]
        assert rows == [
            ("Apollo CRM", "Priya Shah", 120, True),
            ("hermes billing", "Priya Shah", 120, True),
            ("Zeus Portal", "omar haddad", 20, False),
            ("Zeus Portal", "Priya Shah", 120, True),
        ]

    def test_filters_by_project_and_resource(self, api, tokens, db_conn, priya, apollo):
        omar = add_resource(db_conn, "Omar Haddad", "omar@acme.com")
        zeus = add_project(db_conn, "Zeus Portal")
        allocate(db_conn, priya, apollo, 10)
        allocate(db_conn, omar, apollo, 20)
        allocate(db_conn, priya, zeus, 30)

        def percents(**query):
            items = api.get("/allocations", token=tokens["viewer"], query=query).body["items"]
            return [a["allocation_percent"] for a in items]

        assert percents(project_id=apollo) == [20, 10]  # Omar before Priya
        assert percents(resource_id=priya) == [10, 30]  # Apollo before Zeus
        assert percents(project_id=zeus, resource_id=priya) == [30]
        assert percents(project_id=zeus, resource_id=omar) == []

    def test_empty_list(self, api, tokens):
        assert api.get("/allocations", token=tokens["viewer"]).body == {"items": [], "total": 0}

    @pytest.mark.parametrize("name", ["project_id", "resource_id"])
    @pytest.mark.parametrize("value", ["abc", "0", "-3"])
    def test_invalid_filter_values(self, api, tokens, name, value):
        result = api.get("/allocations", token=tokens["viewer"], query={name: value})
        assert_error(result, 400, "VALIDATION_ERROR", name)


class TestGetAllocation:
    def test_returns_allocation_with_current_totals(self, api, tokens, db_conn, priya, apollo):
        allocation = allocate(db_conn, priya, apollo, 60)
        allocate(db_conn, priya, add_project(db_conn, "Zeus Portal"), 45)
        result = api.get(f"/allocations/{allocation}", token=tokens["viewer"])
        assert result.status == 200 and set(result.body) == ALLOCATION_FIELDS
        body = result.body
        assert (body["id"], body["allocation_percent"], body["resource_name"]) == (allocation, 60, "Priya Shah")
        assert (body["resource_total_allocation_percent"], body["resource_over_allocated"]) == (105, True)

    def test_unknown_allocation_is_404(self, api, tokens):
        assert_error(api.get("/allocations/999", token=tokens["viewer"]), 404, "NOT_FOUND")


class TestUpdateAllocation:
    def test_updates_percentage_and_returns_totals_after_the_change(self, api, tokens, db_conn, priya, apollo):
        allocate(db_conn, priya, add_project(db_conn, "Zeus Portal"), 50)
        allocation = allocate(db_conn, priya, apollo, 40)
        db_conn.execute(
            "UPDATE allocations SET created_at = %s, updated_at = %s WHERE id = %s", (PAST, PAST, allocation)
        )

        result = api.put(
            f"/allocations/{allocation}", token=tokens["contributor"], body=allocation_body(priya, apollo, 80)
        )
        assert result.status == 200 and set(result.body) == ALLOCATION_FIELDS
        assert result.body["allocation_percent"] == 80
        assert (result.body["resource_total_allocation_percent"], result.body["resource_over_allocated"]) == (130, True)
        row = stored(db_conn, allocation)
        assert row["allocation_percent"] == 80
        assert row["created_at"] == PAST and row["updated_at"] > PAST

    def test_moves_allocation_to_another_project(self, put, db_conn, priya, apollo):
        zeus = add_project(db_conn, "Zeus Portal", "planned")
        allocation = allocate(db_conn, priya, apollo, 60)
        body = put(allocation, allocation_body(priya, zeus, 60)).body
        assert (body["project_id"], body["project_name"], body["project_status"]) == (zeus, "Zeus Portal", "planned")
        assert body["resource_total_allocation_percent"] == 0  # planned projects do not count
        assert stored(db_conn, allocation)["project_id"] == zeus

    def test_reassigns_allocation_to_another_person(self, put, db_conn, priya, apollo):
        omar = add_resource(db_conn, "Omar Haddad", "omar@acme.com")
        allocation = allocate(db_conn, priya, apollo, 60)
        body = put(allocation, allocation_body(omar, apollo, 60)).body
        assert (body["resource_id"], body["resource_name"], body["resource_total_allocation_percent"]) == (
            omar,
            "Omar Haddad",
            60,
        )

    def test_moving_onto_an_existing_pair_is_a_conflict(self, put, db_conn, priya, apollo):
        zeus = add_project(db_conn, "Zeus Portal")
        allocate(db_conn, priya, zeus, 30)
        allocation = allocate(db_conn, priya, apollo, 60)
        assert_error(put(allocation, allocation_body(priya, zeus, 60)), 409, "CONFLICT", "resource_id")
        assert stored(db_conn, allocation)["project_id"] == apollo

    def test_unknown_project_in_body(self, put, db_conn, priya, apollo):
        allocation = allocate(db_conn, priya, apollo, 60)
        assert_error(put(allocation, allocation_body(priya, 999)), 400, "VALIDATION_ERROR", "project_id")

    def test_unknown_resource_in_body(self, put, db_conn, priya, apollo):
        allocation = allocate(db_conn, priya, apollo, 60)
        assert_error(put(allocation, allocation_body(999, apollo)), 400, "VALIDATION_ERROR", "resource_id")

    @pytest.mark.parametrize("percent", [0, 101, 50.5, "abc", True])
    def test_invalid_percentage(self, put, db_conn, priya, apollo, percent):
        allocation = allocate(db_conn, priya, apollo, 60)
        result = put(allocation, allocation_body(priya, apollo, percent))
        assert_error(result, 400, "VALIDATION_ERROR", "allocation_percent")
        assert stored(db_conn, allocation)["allocation_percent"] == 60

    def test_put_is_a_full_update(self, put, db_conn, priya, apollo):
        allocation = allocate(db_conn, priya, apollo, 60)
        error = assert_error(put(allocation, {"allocation_percent": 50}), 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"resource_id", "project_id"}

    def test_unknown_allocation_is_404(self, put, priya, apollo):
        assert_error(put(999, allocation_body(priya, apollo)), 404, "NOT_FOUND")

    def test_malformed_json(self, put, db_conn, priya, apollo):
        allocation = allocate(db_conn, priya, apollo, 60)
        assert_error(put(allocation, raw_body="nope"), 400, "INVALID_JSON")


class TestDeleteAllocation:
    def test_deletes_allocation_and_frees_capacity(self, api, tokens, db_conn, priya, apollo):
        allocation = allocate(db_conn, priya, apollo, 80)
        allocate(db_conn, priya, add_project(db_conn, "Zeus Portal"), 40)
        result = api.delete(f"/allocations/{allocation}", token=tokens["manager"])
        assert result.status == 204 and result.raw == ""
        assert count_allocations(db_conn) == 1
        resource = api.get(f"/resources/{priya}", token=tokens["manager"]).body
        assert (resource["total_allocation_percent"], resource["is_over_allocated"]) == (40, False)
        assert_error(api.get(f"/allocations/{allocation}", token=tokens["manager"]), 404, "NOT_FOUND")

    def test_unknown_allocation_is_404(self, api, tokens):
        assert_error(api.delete("/allocations/999", token=tokens["admin"]), 404, "NOT_FOUND")


class TestEnrichAllocation:
    """``enrich_allocation`` is a pure function (no database access)."""

    def test_adds_the_person_totals(self):
        utilization = {"total_allocation_percent": 120, "active_project_count": 2}
        assert enrich_allocation({"id": 1}, utilization) == {
            "id": 1,
            "resource_total_allocation_percent": 120,
            "resource_over_allocated": True,
        }

    @pytest.mark.parametrize("utilization", [None, {}])
    def test_missing_utilization_counts_as_zero(self, utilization):
        enriched = enrich_allocation({"id": 1}, utilization)
        assert (enriched["resource_total_allocation_percent"], enriched["resource_over_allocated"]) == (0, False)

    def test_exactly_100_percent_is_not_over_allocated(self):
        assert enrich_allocation({}, {"total_allocation_percent": 100})["resource_over_allocated"] is False


# RBAC: action -> (method, path, permission, status when allowed)
ACTIONS = {
    "list": ("GET", "/allocations", "allocations:read", 200),
    "get": ("GET", "/allocations/{id}", "allocations:read", 200),
    "create": ("POST", "/allocations", "allocations:create", 201),
    "update": ("PUT", "/allocations/{id}", "allocations:update", 200),
    "delete": ("DELETE", "/allocations/{id}", "allocations:delete", 204),
}
ALLOWED = {
    "admin": set(ACTIONS),
    "manager": set(ACTIONS),
    "contributor": {"list", "get", "create", "update"},
    "viewer": {"list", "get"},
}


class TestPermissions:
    def _call(self, api, db_conn, action, token):
        priya = add_resource(db_conn, "Priya Shah", "priya@acme.com")
        apollo, zeus = add_project(db_conn, "Apollo CRM"), add_project(db_conn, "Zeus Portal")
        allocation = allocate(db_conn, priya, apollo, 60)
        method, path, _, _ = ACTIONS[action]
        bodies = {"create": allocation_body(priya, zeus, 20), "update": allocation_body(priya, apollo, 70)}
        return api.request(method, path.format(id=allocation), token=token, body=bodies.get(action))

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
            rows = db_conn.execute("SELECT project_id, allocation_percent FROM allocations").fetchall()
            assert rows == [{"project_id": 1, "allocation_percent": 60}]  # nothing changed
