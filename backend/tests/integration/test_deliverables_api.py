"""Integration tests: /deliverables CRUD, filters, overdue rule, dependency graph and RBAC."""

from datetime import UTC, date, datetime

import pytest

from app.core import clock
from app.deliverables import repository
from helpers import assert_error

TODAY = date(2026, 6, 15)

LIST_FIELDS = {
    "id",
    "project_id",
    "project_name",
    "name",
    "description",
    "status",
    "due_date",
    "is_key",
    "owner_id",
    "owner_name",
    "is_overdue",
    "depends_on_ids",
    "created_at",
    "updated_at",
}
DETAIL_FIELDS = LIST_FIELDS | {"depends_on", "dependency_chain", "blocks"}
RELATED_FIELDS = {"id", "name", "status", "due_date", "project_id", "project_name"}


@pytest.fixture(autouse=True)
def frozen_today(monkeypatch):
    """Business rules read clock.today(); freeze it so is_overdue is deterministic."""
    monkeypatch.setattr(clock, "today", lambda: TODAY)


@pytest.fixture
def admin(tokens):
    return tokens["admin"]


# Projects and resources are arranged with direct SQL, so these tests only exercise /deliverables.
def add_project(db_conn, name="Apollo CRM") -> int:
    return db_conn.execute(
        "INSERT INTO projects (name, department, start_date, end_date) VALUES (%s, 'IT', '2026-01-01', '2026-12-31')"
        " RETURNING id",
        (name,),
    ).fetchone()["id"]


def add_resource(db_conn, full_name="Priya Shah", email="priya@acme.com") -> int:
    return db_conn.execute(
        "INSERT INTO resources (full_name, email, job_title, department) VALUES (%s, %s, 'Developer', 'IT') RETURNING id",
        (full_name, email),
    ).fetchone()["id"]


@pytest.fixture
def project_id(db_conn):
    return add_project(db_conn)


def deliverable_body(project_id, **overrides) -> dict:
    body = {
        "project_id": project_id,
        "name": "Requirements sign-off",
        "description": "Agree the scope",
        "status": "in_progress",
        "due_date": "2026-07-01",
        "is_key": True,
    }
    body.update(overrides)
    return body


def create_deliverable(api, token, project_id, **overrides) -> dict:
    result = api.post("/deliverables", token=token, body=deliverable_body(project_id, **overrides))
    assert result.status == 201, result.body
    return result.body


def get_deliverable(api, token, deliverable_id) -> dict:
    result = api.get(f"/deliverables/{deliverable_id}", token=token)
    assert result.status == 200, result.body
    return result.body


def ids(items) -> list[int]:
    return [item["id"] for item in items]


def depths(items) -> list[tuple[int, int]]:
    return [(item["id"], item["depth"]) for item in items]


def linked_ids(db_conn, deliverable_id) -> list[int]:
    rows = db_conn.execute(
        "SELECT depends_on_id FROM deliverable_dependencies WHERE deliverable_id = %s ORDER BY depends_on_id",
        (deliverable_id,),
    ).fetchall()
    return [row["depends_on_id"] for row in rows]


@pytest.fixture
def chain(api, admin, project_id):
    """A <- B <- C <- D: B depends on A, C on B and D on C (due on 1-4 July)."""
    made, previous = {}, []
    for day, name in enumerate("ABCD", start=1):
        made[name] = create_deliverable(
            api, admin, project_id, name=name, due_date=f"2026-07-0{day}", depends_on_ids=previous
        )["id"]
        previous = [made[name]]
    return made


class TestCreate:
    def test_creates_deliverable_with_names_and_dependencies(self, api, admin, db_conn, project_id):
        owner = add_resource(db_conn)
        later = create_deliverable(api, admin, project_id, name="Budget approval", due_date="2026-06-20")["id"]
        earlier = create_deliverable(api, admin, project_id, name="Kick-off", due_date="2026-06-01")["id"]
        body = deliverable_body(project_id, name="  Scope sign-off ", owner_id=owner, depends_on_ids=[earlier, later])

        result = api.post("/deliverables", token=admin, body=body)
        assert result.status == 201
        deliverable = result.body
        assert set(deliverable) == DETAIL_FIELDS
        expected = {**body, "name": "Scope sign-off", "depends_on_ids": [later, earlier]}  # ids sorted by id
        assert {key: deliverable[key] for key in body} == expected
        assert (deliverable["project_name"], deliverable["owner_name"]) == ("Apollo CRM", "Priya Shah")
        assert deliverable["is_overdue"] is False
        assert ids(deliverable["depends_on"]) == [earlier, later]  # related items sorted by due date
        assert depths(deliverable["dependency_chain"]) == [(earlier, 1), (later, 1)]
        assert deliverable["blocks"] == []

        row = db_conn.execute("SELECT * FROM deliverables WHERE id = %s", (deliverable["id"],)).fetchone()
        assert (row["project_id"], row["name"], row["status"]) == (project_id, "Scope sign-off", "in_progress")
        assert (row["due_date"], row["is_key"], row["owner_id"]) == (date(2026, 7, 1), True, owner)
        assert linked_ids(db_conn, deliverable["id"]) == sorted([later, earlier])

    def test_optional_fields_have_defaults(self, api, admin, project_id):
        body = {"project_id": project_id, "name": "Minimal", "due_date": "2026-07-01"}
        deliverable = api.post("/deliverables", token=admin, body=body).body
        expected = {
            "description": "",
            "status": "not_started",
            "is_key": False,
            "owner_id": None,
            "owner_name": None,
            "depends_on_ids": [],
        }
        assert {key: deliverable[key] for key in expected} == expected
        assert (deliverable["depends_on"], deliverable["dependency_chain"], deliverable["blocks"]) == ([], [], [])

    def test_missing_required_fields(self, api, admin):
        error = assert_error(api.post("/deliverables", token=admin, body={}), 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"project_id", "name", "due_date"}

    @pytest.mark.parametrize(
        "overrides, field",
        [
            ({"name": "  "}, "name"),
            ({"name": "x" * 151}, "name"),
            ({"description": "x" * 5001}, "description"),
            ({"status": "done"}, "status"),
            ({"due_date": "2026-13-01"}, "due_date"),
            ({"due_date": None}, "due_date"),
            # numbers are not dates: lax parsing would read them as Unix timestamps (0 -> 1970-01-01)
            ({"due_date": 0}, "due_date"),
            ({"due_date": "0"}, "due_date"),
            ({"due_date": 1782864000}, "due_date"),
            ({"due_date": "2026-07-01T00:00:00"}, "due_date"),
            ({"name": 123}, "name"),
            ({"is_key": "maybe"}, "is_key"),
            ({"project_id": "abc"}, "project_id"),
            ({"project_id": 1.5}, "project_id"),
            ({"project_id": 0}, "project_id"),
            ({"owner_id": -1}, "owner_id"),
            ({"owner_id": "someone"}, "owner_id"),
            ({"depends_on_ids": "1,2"}, "depends_on_ids"),
            ({"depends_on_ids": None}, "depends_on_ids"),
            ({"depends_on_ids": [0]}, "depends_on_ids"),
            ({"depends_on_ids": ["first"]}, "depends_on_ids"),
            ({"depends_on_ids": [2147483648]}, "depends_on_ids"),
        ],
    )
    def test_invalid_field(self, api, admin, project_id, overrides, field):
        result = api.post("/deliverables", token=admin, body={**deliverable_body(project_id), **overrides})
        assert set(assert_error(result, 400, "VALIDATION_ERROR")["details"]) == {field}

    @pytest.mark.parametrize("value", [True, "1", 1.0])
    def test_ids_must_be_json_integers(self, api, admin, db_conn, project_id, value):
        """Lax parsing would read true, "1" and 1.0 as id 1: here an existing project, resource and deliverable."""
        add_resource(db_conn)
        create_deliverable(api, admin, project_id, name="Existing")
        for field, bad_value, message in (
            ("project_id", value, "Must be a whole number"),
            ("owner_id", value, "Must be a whole number"),
            ("depends_on_ids", [value], "Must be a list of deliverable ids"),
        ):
            body = {**deliverable_body(project_id, name="New"), field: bad_value}
            error = assert_error(api.post("/deliverables", token=admin, body=body), 400, "VALIDATION_ERROR")
            assert error["details"] == {field: message}
        assert db_conn.execute("SELECT COUNT(*) AS n FROM deliverables").fetchone()["n"] == 1

    def test_text_fields_accept_their_maximum_length(self, api, admin, project_id):
        deliverable = create_deliverable(api, admin, project_id, name="n" * 150, description="x" * 5000)
        assert (len(deliverable["name"]), len(deliverable["description"])) == (150, 5000)

    def test_duplicate_dependency_ids(self, api, admin, project_id):
        prerequisite = create_deliverable(api, admin, project_id, name="Kick-off")["id"]
        body = deliverable_body(project_id, depends_on_ids=[prerequisite, prerequisite])
        error = assert_error(api.post("/deliverables", token=admin, body=body), 400, "VALIDATION_ERROR")
        assert error["details"] == {"depends_on_ids": "Must not contain duplicate ids"}

    def test_malformed_bodies(self, api, admin):
        assert_error(api.post("/deliverables", token=admin, raw_body="{oops"), 400, "INVALID_JSON")
        assert_error(api.post("/deliverables", token=admin, body=["x"]), 400, "VALIDATION_ERROR", "body")
        assert_error(api.post("/deliverables", token=admin), 400, "VALIDATION_ERROR", "body")

    def test_unknown_project(self, api, admin):
        error = assert_error(
            api.post("/deliverables", token=admin, body=deliverable_body(999)), 400, "VALIDATION_ERROR"
        )
        assert error["details"] == {"project_id": "Project not found"}

    def test_unknown_owner(self, api, admin, project_id):
        body = deliverable_body(project_id, owner_id=999)
        error = assert_error(api.post("/deliverables", token=admin, body=body), 400, "VALIDATION_ERROR")
        assert error["details"] == {"owner_id": "Resource not found"}

    def test_unknown_prerequisites(self, api, admin, project_id):
        prerequisite = create_deliverable(api, admin, project_id, name="Kick-off")["id"]
        body = deliverable_body(project_id, depends_on_ids=[999, prerequisite, 998])
        error = assert_error(api.post("/deliverables", token=admin, body=body), 400, "VALIDATION_ERROR")
        assert error["details"] == {"depends_on_ids": "Deliverable(s) not found: 998, 999"}

    def test_every_reference_error_is_reported_at_once(self, api, admin, db_conn):
        body = deliverable_body(999, owner_id=999, depends_on_ids=[999])
        error = assert_error(api.post("/deliverables", token=admin, body=body), 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"project_id", "owner_id", "depends_on_ids"}
        assert db_conn.execute("SELECT COUNT(*) AS n FROM deliverables").fetchone()["n"] == 0

    def test_name_is_unique_within_a_project_case_insensitively(self, api, admin, project_id):
        create_deliverable(api, admin, project_id, name="Sign-off")
        result = api.post("/deliverables", token=admin, body=deliverable_body(project_id, name=" SIGN-OFF "))
        assert set(assert_error(result, 409, "CONFLICT")["details"]) == {"name"}

    def test_same_name_in_another_project_is_allowed(self, api, admin, db_conn, project_id):
        create_deliverable(api, admin, project_id, name="Sign-off")
        other = create_deliverable(api, admin, add_project(db_conn, "Zeus"), name="Sign-off")
        assert other["project_name"] == "Zeus"

    def test_dependencies_may_point_to_other_projects(self, api, admin, db_conn, project_id):
        upstream = create_deliverable(api, admin, add_project(db_conn, "Zeus"), name="Vendor contract")
        deliverable = create_deliverable(api, admin, project_id, depends_on_ids=[upstream["id"]])
        assert deliverable["depends_on"] == [{key: upstream[key] for key in RELATED_FIELDS}]
        assert deliverable["depends_on"][0]["project_name"] == "Zeus"

    def test_unknown_and_computed_fields_are_ignored(self, api, admin, project_id):
        body = deliverable_body(project_id, id=50, is_overdue=True, project_name="Fake", blocks=[1], extra=True)
        deliverable = api.post("/deliverables", token=admin, body=body).body
        assert (deliverable["id"], deliverable["is_overdue"], deliverable["project_name"]) == (1, False, "Apollo CRM")
        assert "extra" not in deliverable


class TestRead:
    def test_get_by_id(self, api, admin, tokens, project_id):
        created = create_deliverable(api, admin, project_id)
        assert get_deliverable(api, tokens["viewer"], created["id"]) == created

    def test_unknown_id_is_404(self, api, admin):
        assert_error(api.get("/deliverables/999", token=admin), 404, "NOT_FOUND")

    def test_invalid_id_is_400(self, api, admin):
        assert_error(api.get("/deliverables/0", token=admin), 400, "VALIDATION_ERROR", "id")

    @pytest.mark.parametrize(
        "status, due_date, overdue",
        [
            ("not_started", "2026-06-14", True),
            ("in_progress", "2026-06-14", True),
            ("blocked", "2026-01-01", True),
            ("in_progress", "2026-06-15", False),  # due today is not overdue yet
            ("not_started", "2026-06-16", False),
            ("completed", "2026-06-01", False),
        ],
    )
    def test_is_overdue(self, api, admin, project_id, status, due_date, overdue):
        deliverable = create_deliverable(api, admin, project_id, status=status, due_date=due_date)
        assert deliverable["is_overdue"] is overdue
        listed = api.get("/deliverables", token=admin).body["items"]
        assert [item["is_overdue"] for item in listed] == [overdue]

    def test_owner_is_cleared_when_the_resource_is_deleted(self, api, admin, db_conn, project_id):
        owner = add_resource(db_conn)
        deliverable = create_deliverable(api, admin, project_id, owner_id=owner)
        db_conn.execute("DELETE FROM resources WHERE id = %s", (owner,))
        reloaded = get_deliverable(api, admin, deliverable["id"])
        assert (reloaded["owner_id"], reloaded["owner_name"]) == (None, None)


@pytest.fixture
def catalog(api, admin, db_conn, project_id):
    """Four deliverables in two projects for the list tests (Build is the only overdue one)."""
    owner = add_resource(db_conn)
    other_project = add_project(db_conn, "Zeus")
    rows = [
        (project_id, "Spec", "Write the API contract", "completed", "2026-06-01", True, owner),
        (project_id, "Build", "Implement 100% of the API", "in_progress", "2026-06-10", False, owner),
        (project_id, "Test", "Cover 1000 cases", "blocked", "2026-06-20", True, None),
        (other_project, "Launch", "Go live", "not_started", "2026-07-01", True, None),
    ]
    made = {"project": project_id, "other_project": other_project, "owner": owner}
    for project, name, description, status, due_date, is_key, owner_id in rows:
        made[name] = create_deliverable(
            api,
            admin,
            project,
            name=name,
            description=description,
            status=status,
            due_date=due_date,
            is_key=is_key,
            owner_id=owner_id,
        )["id"]
    return made


def listed_names(api, token, **query) -> list[str]:
    result = api.get("/deliverables", token=token, query=query)
    assert result.status == 200, result.body
    assert result.body["total"] == len(result.body["items"])
    return [item["name"] for item in result.body["items"]]


class TestList:
    def test_empty(self, api, admin):
        assert api.get("/deliverables", token=admin).body == {"items": [], "total": 0}

    def test_sorted_by_due_date_then_id(self, api, admin, project_id):
        first = create_deliverable(api, admin, project_id, name="A", due_date="2026-08-01")["id"]
        second = create_deliverable(api, admin, project_id, name="B", due_date="2026-07-01")["id"]
        third = create_deliverable(api, admin, project_id, name="C", due_date="2026-08-01")["id"]
        result = api.get("/deliverables", token=admin)
        assert ids(result.body["items"]) == [second, first, third] and result.body["total"] == 3
        assert all(set(item) == LIST_FIELDS for item in result.body["items"])

    @pytest.mark.parametrize(
        "query, expected",
        [
            ({}, ["Spec", "Build", "Test", "Launch"]),
            ({"search": "api"}, ["Spec", "Build"]),
            ({"search": "LIVE"}, ["Launch"]),
            ({"search": "100%"}, ["Build"]),
            ({"status": "blocked"}, ["Test"]),
            ({"is_key": "true"}, ["Spec", "Test", "Launch"]),
            ({"is_key": "false"}, ["Build"]),
            ({"overdue": "true"}, ["Build"]),
            ({"overdue": "false"}, ["Spec", "Test", "Launch"]),
            ({"search": "a", "is_key": "true", "status": "not_started"}, ["Launch"]),
        ],
    )
    def test_filters(self, api, admin, catalog, query, expected):
        assert listed_names(api, admin, **query) == expected

    def test_filter_by_project_and_owner(self, api, admin, catalog):
        assert listed_names(api, admin, project_id=catalog["other_project"]) == ["Launch"]
        assert listed_names(api, admin, owner_id=catalog["owner"]) == ["Spec", "Build"]
        assert listed_names(api, admin, project_id=catalog["project"], is_key="true", overdue="false") == [
            "Spec",
            "Test",
        ]
        assert listed_names(api, admin, project_id=999) == []

    def test_items_carry_names_and_dependencies(self, api, admin, catalog):
        update = {
            **get_deliverable(api, admin, catalog["Launch"]),
            "depends_on_ids": [catalog["Test"], catalog["Spec"]],
        }
        assert api.put(f"/deliverables/{catalog['Launch']}", token=admin, body=update).status == 200
        launch = api.get("/deliverables", token=admin, query={"search": "launch"}).body["items"][0]
        assert (launch["project_name"], launch["owner_name"]) == ("Zeus", None)
        assert launch["depends_on_ids"] == sorted([catalog["Test"], catalog["Spec"]])
        spec = api.get("/deliverables", token=admin, query={"search": "spec"}).body["items"][0]
        assert (spec["owner_name"], spec["depends_on_ids"]) == ("Priya Shah", [])

    @pytest.mark.parametrize(
        "query, field",
        [
            ({"project_id": "abc"}, "project_id"),
            ({"owner_id": "0"}, "owner_id"),
            ({"status": "done"}, "status"),
            ({"is_key": "maybe"}, "is_key"),
            ({"overdue": "soon"}, "overdue"),
            ({"search": "x" * 201}, "search"),
        ],
    )
    def test_invalid_filter(self, api, admin, query, field):
        assert_error(api.get("/deliverables", token=admin, query=query), 400, "VALIDATION_ERROR", field)


class TestUpdate:
    def test_full_update_replaces_fields_and_dependencies(self, api, tokens, db_conn, project_id):
        admin = tokens["admin"]
        first = create_deliverable(api, admin, project_id, name="First")["id"]
        second = create_deliverable(api, admin, project_id, name="Second")["id"]
        target = create_deliverable(api, admin, project_id, name="Target", depends_on_ids=[first])
        other_project = add_project(db_conn, "Zeus")
        owner = add_resource(db_conn)
        db_conn.execute("UPDATE deliverables SET updated_at = '2020-01-01T00:00:00Z' WHERE id = %s", (target["id"],))
        body = deliverable_body(
            other_project,
            name="Target v2",
            description="",
            status="completed",
            due_date="2026-09-30",
            is_key=False,
            owner_id=owner,
            depends_on_ids=[second],
        )

        result = api.put(f"/deliverables/{target['id']}", token=tokens["contributor"], body=body)
        assert result.status == 200
        assert {key: result.body[key] for key in body} == body
        assert (result.body["project_name"], result.body["owner_name"]) == ("Zeus", "Priya Shah")
        assert result.body["created_at"] == target["created_at"]
        assert linked_ids(db_conn, target["id"]) == [second]
        assert get_deliverable(api, admin, first)["blocks"] == []
        assert ids(get_deliverable(api, admin, second)["blocks"]) == [target["id"]]
        row = db_conn.execute("SELECT * FROM deliverables WHERE id = %s", (target["id"],)).fetchone()
        assert (row["project_id"], row["name"], row["owner_id"]) == (other_project, "Target v2", owner)
        assert row["updated_at"] > datetime(2020, 1, 2, tzinfo=UTC)

    def test_omitted_optional_fields_reset_to_defaults(self, api, admin, db_conn, chain, project_id):
        body = {"project_id": project_id, "name": "C", "due_date": "2026-07-03"}
        updated = api.put(f"/deliverables/{chain['C']}", token=admin, body=body).body
        assert (updated["status"], updated["is_key"], updated["description"]) == ("not_started", False, "")
        assert updated["depends_on_ids"] == [] and linked_ids(db_conn, chain["C"]) == []

    def test_a_received_object_can_be_sent_back(self, api, admin, chain):
        received = get_deliverable(api, admin, chain["C"])
        result = api.put(f"/deliverables/{chain['C']}", token=admin, body={**received, "status": "completed"})
        assert result.status == 200
        assert (result.body["status"], result.body["depends_on_ids"]) == ("completed", [chain["B"]])

    def test_keeping_its_own_name_in_another_case(self, api, admin, project_id):
        deliverable = create_deliverable(api, admin, project_id, name="Sign-off")
        body = deliverable_body(project_id, name="SIGN-OFF")
        result = api.put(f"/deliverables/{deliverable['id']}", token=admin, body=body)
        assert result.status == 200 and result.body["name"] == "SIGN-OFF"

    def test_renaming_to_a_sibling_name_is_a_conflict(self, api, admin, project_id):
        create_deliverable(api, admin, project_id, name="Sign-off")
        other = create_deliverable(api, admin, project_id, name="Draft")
        result = api.put(
            f"/deliverables/{other['id']}", token=admin, body=deliverable_body(project_id, name="sign-off")
        )
        assert_error(result, 409, "CONFLICT", "name")

    def test_moving_into_a_project_with_the_same_name_is_a_conflict(self, api, admin, db_conn, project_id):
        other_project = add_project(db_conn, "Zeus")
        create_deliverable(api, admin, other_project, name="Sign-off")
        mine = create_deliverable(api, admin, project_id, name="Sign-off")
        result = api.put(
            f"/deliverables/{mine['id']}", token=admin, body=deliverable_body(other_project, name="Sign-off")
        )
        assert_error(result, 409, "CONFLICT", "name")

    def test_references_are_validated(self, api, admin, project_id):
        deliverable = create_deliverable(api, admin, project_id)
        body = deliverable_body(999, owner_id=999, depends_on_ids=[999])
        error = assert_error(
            api.put(f"/deliverables/{deliverable['id']}", token=admin, body=body), 400, "VALIDATION_ERROR"
        )
        assert set(error["details"]) == {"project_id", "owner_id", "depends_on_ids"}

    @pytest.mark.parametrize("overrides, field", [({"status": "x"}, "status"), ({"due_date": 0}, "due_date")])
    def test_invalid_field(self, api, admin, project_id, overrides, field):
        deliverable = create_deliverable(api, admin, project_id)
        result = api.put(
            f"/deliverables/{deliverable['id']}", token=admin, body=deliverable_body(project_id, **overrides)
        )
        assert set(assert_error(result, 400, "VALIDATION_ERROR")["details"]) == {field}

    def test_malformed_bodies(self, api, admin, project_id):
        path = f"/deliverables/{create_deliverable(api, admin, project_id)['id']}"
        assert_error(api.put(path, token=admin, raw_body="{oops"), 400, "INVALID_JSON")
        assert_error(api.put(path, token=admin), 400, "VALIDATION_ERROR", "body")

    def test_unknown_id_is_404(self, api, admin, project_id):
        create_deliverable(api, admin, project_id)  # the URL id is checked before the name (409) and references (400)
        assert_error(api.put("/deliverables/999", token=admin, body=deliverable_body(project_id)), 404, "NOT_FOUND")
        body = deliverable_body(project_id, owner_id=999, depends_on_ids=[999])
        assert_error(api.put("/deliverables/999", token=admin, body=body), 404, "NOT_FOUND")

    def test_deliverable_deleted_by_a_concurrent_request_is_404(self, api, admin, monkeypatch, chain, project_id):
        real_name_taken = repository.name_taken

        def deleted_meanwhile(conn, *args, **kwargs):
            """Runs between the existence check and the UPDATE, like a DELETE committed by another user."""
            conn.execute("DELETE FROM deliverables WHERE id = %s", (chain["C"],))
            return real_name_taken(conn, *args, **kwargs)

        monkeypatch.setattr(repository, "name_taken", deleted_meanwhile)
        body = deliverable_body(project_id, name="C", depends_on_ids=[chain["A"]])
        assert_error(api.put(f"/deliverables/{chain['C']}", token=admin, body=body), 404, "NOT_FOUND")


class TestDependencyGraph:
    def test_long_chain(self, api, admin, chain, project_id):
        last = get_deliverable(api, admin, chain["D"])
        assert depths(last["dependency_chain"]) == [(chain["C"], 1), (chain["B"], 2), (chain["A"], 3)]
        assert ids(last["depends_on"]) == [chain["C"]] and last["blocks"] == []
        assert last["depends_on"][0] == {
            "id": chain["C"],
            "name": "C",
            "status": "in_progress",
            "due_date": "2026-07-03",
            "project_id": project_id,
            "project_name": "Apollo CRM",
        }
        assert all(set(item) == RELATED_FIELDS | {"depth"} for item in last["dependency_chain"])
        assert all(set(item) == RELATED_FIELDS for item in last["blocks"] + last["depends_on"])

        first = get_deliverable(api, admin, chain["A"])
        assert (first["dependency_chain"], first["depends_on"]) == ([], [])
        assert ids(first["blocks"]) == [chain["B"]]
        middle = get_deliverable(api, admin, chain["B"])
        assert depths(middle["dependency_chain"]) == [(chain["A"], 1)] and ids(middle["blocks"]) == [chain["C"]]

    def test_diamond_lists_the_shared_prerequisite_once(self, api, admin, project_id):
        def make(name, due_date, depends_on_ids=()):
            return create_deliverable(
                api, admin, project_id, name=name, due_date=due_date, depends_on_ids=list(depends_on_ids)
            )

        top = make("Top", "2026-07-01")["id"]
        left = make("Left", "2026-08-02", [top])["id"]
        right = make("Right", "2026-08-01", [top])["id"]
        bottom = make("Bottom", "2026-09-01", [left, right])

        assert depths(bottom["dependency_chain"]) == [(right, 1), (left, 1), (top, 2)]  # depth, then due date
        assert ids(bottom["depends_on"]) == [right, left]
        assert ids(get_deliverable(api, admin, top)["blocks"]) == [right, left]

    def test_prerequisite_reachable_at_several_depths_uses_the_smallest(self, api, admin, chain):
        body = {**get_deliverable(api, admin, chain["D"]), "depends_on_ids": [chain["C"], chain["A"]]}
        result = api.put(f"/deliverables/{chain['D']}", token=admin, body=body)
        assert result.status == 200  # a shortcut to an existing upstream node is not a cycle
        assert depths(result.body["dependency_chain"]) == [(chain["A"], 1), (chain["C"], 1), (chain["B"], 2)]

    def test_deleting_a_prerequisite_removes_the_link(self, api, admin, db_conn, chain):
        result = api.delete(f"/deliverables/{chain['B']}", token=admin)
        assert result.status == 204 and result.raw == ""
        assert_error(api.get(f"/deliverables/{chain['B']}", token=admin), 404, "NOT_FOUND")
        dependent = get_deliverable(api, admin, chain["C"])
        assert (dependent["depends_on_ids"], dependent["dependency_chain"]) == ([], [])
        assert get_deliverable(api, admin, chain["A"])["blocks"] == []
        assert depths(get_deliverable(api, admin, chain["D"])["dependency_chain"]) == [(chain["C"], 1)]
        links = db_conn.execute(
            "SELECT COUNT(*) AS n FROM deliverable_dependencies WHERE %s IN (deliverable_id, depends_on_id)",
            (chain["B"],),
        ).fetchone()
        assert links["n"] == 0

    def test_cyclic_data_written_outside_the_api_cannot_hang_the_chain(self, api, admin, db_conn, chain):
        db_conn.execute(
            "INSERT INTO deliverable_dependencies (deliverable_id, depends_on_id) VALUES (%s, %s)",
            (chain["A"], chain["D"]),
        )
        result = api.get(f"/deliverables/{chain['D']}", token=admin)
        assert result.status == 200  # the depth limit stops the recursion
        assert depths(result.body["dependency_chain"])[:3] == [(chain["C"], 1), (chain["B"], 2), (chain["A"], 3)]

    def test_removing_a_link_allows_the_reverse_link(self, api, admin, chain, project_id):
        assert (
            api.put(f"/deliverables/{chain['C']}", token=admin, body=deliverable_body(project_id, name="C")).status
            == 200
        )
        body = deliverable_body(project_id, name="B", depends_on_ids=[chain["A"], chain["C"]])
        result = api.put(f"/deliverables/{chain['B']}", token=admin, body=body)
        assert result.status == 200
        assert depths(result.body["dependency_chain"]) == [(chain["A"], 1), (chain["C"], 1)]


class TestCycles:
    def _update_dependencies(self, api, token, deliverable_id, depends_on_ids, **overrides):
        body = {**get_deliverable(api, token, deliverable_id), "depends_on_ids": depends_on_ids, **overrides}
        return api.put(f"/deliverables/{deliverable_id}", token=token, body=body)

    def test_cannot_depend_on_itself(self, api, admin, chain):
        result = self._update_dependencies(api, admin, chain["A"], [chain["A"]])
        error = assert_error(result, 400, "VALIDATION_ERROR")
        assert error["details"] == {"depends_on_ids": "A deliverable cannot depend on itself"}

    def test_direct_cycle_is_rejected(self, api, admin, chain):
        error = assert_error(self._update_dependencies(api, admin, chain["A"], [chain["B"]]), 400, "VALIDATION_ERROR")
        assert error["details"] == {
            "depends_on_ids": f"Circular dependency: deliverable {chain['B']} already depends on this deliverable"
        }

    def test_several_cyclic_prerequisites_are_listed_together(self, api, admin, chain):
        # B and C both (transitively) depend on A, so neither can become A's prerequisite
        error = assert_error(self._update_dependencies(api, admin, chain["A"], [chain["C"], chain["B"]]), 400)
        first, second = sorted((chain["B"], chain["C"]))
        assert error["details"] == {
            "depends_on_ids": f"Circular dependency: deliverables {first}, {second} already depend on this deliverable"
        }

    @pytest.mark.parametrize("prerequisite", ["C", "D"])
    def test_indirect_cycle_is_rejected(self, api, admin, chain, prerequisite):
        result = self._update_dependencies(api, admin, chain["A"], [chain[prerequisite]])
        assert_error(result, 400, "VALIDATION_ERROR", "depends_on_ids")

    def test_cycle_in_the_middle_of_the_chain_is_rejected(self, api, admin, chain):
        # B -> A already; making B depend on D closes B -> D -> C -> B
        result = self._update_dependencies(api, admin, chain["B"], [chain["A"], chain["D"]])
        assert_error(result, 400, "VALIDATION_ERROR", "depends_on_ids")

    def test_cross_project_cycle_is_rejected(self, api, admin, db_conn, project_id):
        mine = create_deliverable(api, admin, project_id, name="Mine")["id"]
        theirs = create_deliverable(api, admin, add_project(db_conn, "Zeus"), name="Theirs", depends_on_ids=[mine])[
            "id"
        ]
        assert_error(self._update_dependencies(api, admin, mine, [theirs]), 400, "VALIDATION_ERROR", "depends_on_ids")

    def test_a_rejected_update_changes_nothing(self, api, admin, db_conn, chain):
        result = self._update_dependencies(api, admin, chain["A"], [chain["D"]], name="Renamed", status="completed")
        assert_error(result, 400, "VALIDATION_ERROR", "depends_on_ids")
        unchanged = get_deliverable(api, admin, chain["A"])
        assert (unchanged["name"], unchanged["status"], unchanged["depends_on_ids"]) == ("A", "in_progress", [])
        assert db_conn.execute("SELECT COUNT(*) AS n FROM deliverable_dependencies").fetchone()["n"] == 3


class TestDelete:
    def test_delete(self, api, admin, db_conn, project_id):
        deliverable = create_deliverable(api, admin, project_id)
        result = api.delete(f"/deliverables/{deliverable['id']}", token=admin)
        assert result.status == 204 and result.raw == ""
        assert db_conn.execute("SELECT COUNT(*) AS n FROM deliverables").fetchone()["n"] == 0

    def test_deleting_a_dependent_removes_its_links(self, api, admin, chain):
        assert api.delete(f"/deliverables/{chain['D']}", token=admin).status == 204
        assert get_deliverable(api, admin, chain["C"])["blocks"] == []

    def test_unknown_id_is_404(self, api, admin):
        assert_error(api.delete("/deliverables/999", token=admin), 404, "NOT_FOUND")


ENDPOINTS = [
    ("GET", "/deliverables"),
    ("POST", "/deliverables"),
    ("GET", "/deliverables/1"),
    ("PUT", "/deliverables/1"),
    ("DELETE", "/deliverables/1"),
]
WRITE_PERMISSIONS = [
    ("POST", "/deliverables", "deliverables:create"),
    ("PUT", "/deliverables/1", "deliverables:update"),
    ("DELETE", "/deliverables/1", "deliverables:delete"),
]


class TestPermissions:
    @pytest.mark.parametrize("method, path", ENDPOINTS)
    def test_token_required(self, api, method, path):
        assert_error(api.request(method, path, body=deliverable_body(1)), 401, "AUTH_REQUIRED")

    @pytest.mark.parametrize("method, path, permission", WRITE_PERMISSIONS)
    def test_viewer_cannot_write(self, api, tokens, project_id, method, path, permission):
        create_deliverable(api, tokens["admin"], project_id)
        result = api.request(method, path, token=tokens["viewer"], body=deliverable_body(project_id, name="Other"))
        assert assert_error(result, 403, "FORBIDDEN")["details"] == {"required_permission": permission}
        assert listed_names(api, tokens["viewer"]) == ["Requirements sign-off"]  # nothing written

    def test_viewer_can_read(self, api, tokens, project_id):
        deliverable = create_deliverable(api, tokens["admin"], project_id)
        assert api.get("/deliverables", token=tokens["viewer"]).status == 200
        assert api.get(f"/deliverables/{deliverable['id']}", token=tokens["viewer"]).status == 200

    def test_contributor_can_create_and_update_but_not_delete(self, api, tokens, project_id):
        deliverable = create_deliverable(api, tokens["contributor"], project_id)
        path = f"/deliverables/{deliverable['id']}"
        assert (
            api.put(path, token=tokens["contributor"], body=deliverable_body(project_id, name="Renamed")).status == 200
        )
        result = api.delete(path, token=tokens["contributor"])
        assert assert_error(result, 403, "FORBIDDEN")["details"] == {"required_permission": "deliverables:delete"}
        assert api.get(path, token=tokens["contributor"]).status == 200

    @pytest.mark.parametrize("role", ["manager", "admin"])
    def test_manager_and_admin_have_full_access(self, api, tokens, project_id, role):
        deliverable = create_deliverable(api, tokens[role], project_id)
        path = f"/deliverables/{deliverable['id']}"
        assert api.put(path, token=tokens[role], body=deliverable_body(project_id, name="Renamed")).status == 200
        assert api.delete(path, token=tokens[role]).status == 204
