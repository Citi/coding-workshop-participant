"""Integration tests: /expenses endpoints (CRUD, validation, filters, budget tracking, RBAC).

Projects are arranged with direct SQL so these tests only exercise the expenses endpoints.
Budget consumption is checked through the shared read model (``app.projects.metrics``).
"""

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from pydantic import TypeAdapter
from pydantic import ValidationError as PydanticValidationError

from app.expenses.schemas import EXPENSE_CATEGORIES, IsoDate
from app.projects.metrics import enrich_project, fetch_project_metrics
from helpers import assert_error

EXPENSE_FIELDS = {
    "id",
    "project_id",
    "project_name",
    "category",
    "description",
    "amount",
    "expense_date",
    "created_at",
    "updated_at",
}
PAST = datetime(2020, 1, 1, tzinfo=UTC)
TODAY = date(2026, 6, 1)


def add_project(db_conn, name, budget=0):
    return db_conn.execute(
        "INSERT INTO projects (name, department, status, start_date, end_date, budget)"
        " VALUES (%s, 'IT', 'active', '2026-01-01', '2026-12-31', %s) RETURNING id",
        (name, budget),
    ).fetchone()["id"]


def add_expense(
    db_conn, project_id, *, category="software", description="Licences", amount="100.00", expense_date="2026-02-15"
):
    return db_conn.execute(
        "INSERT INTO expenses (project_id, category, description, amount, expense_date)"
        " VALUES (%s, %s, %s, %s, %s) RETURNING id",
        (project_id, category, description, amount, expense_date),
    ).fetchone()["id"]


def expense_body(project_id, /, **overrides):
    body = {
        "project_id": project_id,
        "category": "software",
        "description": "CRM licences",
        "amount": 12000.5,
        "expense_date": "2026-02-15",
    }
    return {**body, **overrides}


def stored(db_conn, expense_id):
    return db_conn.execute(
        "SELECT project_id, category, description, amount, expense_date, created_at, updated_at FROM expenses WHERE id = %s",
        (expense_id,),
    ).fetchone()


def count_expenses(db_conn):
    return db_conn.execute("SELECT COUNT(*) AS n FROM expenses").fetchone()["n"]


def ids(result):
    return [item["id"] for item in result.body["items"]]


@pytest.fixture
def apollo(db_conn):
    return add_project(db_conn, "Apollo CRM", budget=150000)


class TestCreateExpense:
    def test_creates_expense(self, api, tokens, db_conn, apollo):
        result = api.post(
            "/expenses", token=tokens["contributor"], body=expense_body(apollo, description="  CRM licences ")
        )
        assert result.status == 201
        assert set(result.body) == EXPENSE_FIELDS
        assert {key: result.body[key] for key in EXPENSE_FIELDS - {"id", "created_at", "updated_at"}} == {
            "project_id": apollo,
            "project_name": "Apollo CRM",
            "category": "software",
            "description": "CRM licences",
            "amount": 12000.5,
            "expense_date": "2026-02-15",
        }
        row = stored(db_conn, result.body["id"])
        assert (row["project_id"], row["category"], row["description"]) == (apollo, "software", "CRM licences")
        assert (row["amount"], row["expense_date"]) == (Decimal("12000.50"), date(2026, 2, 15))

    @pytest.mark.parametrize("category", EXPENSE_CATEGORIES)
    def test_every_category_is_accepted(self, api, tokens, apollo, category):
        result = api.post("/expenses", token=tokens["manager"], body=expense_body(apollo, category=category))
        assert result.status == 201 and result.body["category"] == category

    @pytest.mark.parametrize(
        "amount, expected",
        [(0.01, Decimal("0.01")), (25, Decimal("25.00")), (999999999999.99, Decimal("999999999999.99"))],
    )
    def test_amount_limits_are_accepted(self, api, tokens, db_conn, apollo, amount, expected):
        result = api.post("/expenses", token=tokens["manager"], body=expense_body(apollo, amount=amount))
        assert result.status == 201 and result.body["amount"] == float(expected)
        assert stored(db_conn, result.body["id"])["amount"] == expected

    def test_description_of_255_characters_is_accepted(self, api, tokens, apollo):
        result = api.post("/expenses", token=tokens["manager"], body=expense_body(apollo, description="d" * 255))
        assert result.status == 201 and len(result.body["description"]) == 255

    def test_ignores_unknown_and_computed_fields(self, api, tokens, apollo):
        body = expense_body(apollo, id=50, project_name="Other", extra=True)
        result = api.post("/expenses", token=tokens["manager"], body=body)
        assert result.status == 201
        assert (result.body["id"], result.body["project_name"]) == (1, "Apollo CRM") and "extra" not in result.body

    @pytest.mark.parametrize(
        "field, value",
        [
            ("amount", 0),
            ("amount", -10),
            ("amount", 1.234),
            ("amount", 1000000000000),
            ("amount", "abc"),
            ("amount", None),
            ("amount", True),
            ("category", "food"),
            ("category", "Software"),
            ("category", None),
            ("description", ""),
            ("description", "   "),
            ("description", "x" * 256),
            ("expense_date", "2026-02-30"),
            ("expense_date", "15/02/2026"),
            ("expense_date", None),
            ("project_id", 0),
            ("project_id", "abc"),
            ("project_id", True),  # would otherwise be read as id 1, which exists here
            ("project_id", "1"),
        ],
    )
    def test_invalid_values_are_rejected_per_field(self, api, tokens, db_conn, apollo, field, value):
        assert apollo == 1
        result = api.post("/expenses", token=tokens["manager"], body=expense_body(apollo, **{field: value}))
        assert_error(result, 400, "VALIDATION_ERROR", field)
        assert count_expenses(db_conn) == 0

    @pytest.mark.parametrize(
        "value", [0, 1771113600, "0", "1771113600", "2026-02-15T00:00:00", "20260215", True, [2026, 2, 15]]
    )
    def test_expense_date_must_be_yyyy_mm_dd_text(self, api, tokens, db_conn, apollo, value):
        # pydantic alone would read 0 and "0" as Unix timestamps (1970-01-01) and accept datetimes.
        result = api.post("/expenses", token=tokens["manager"], body=expense_body(apollo, expense_date=value))
        error = assert_error(result, 400, "VALIDATION_ERROR", "expense_date")
        assert error["details"]["expense_date"] == "Must be a date in YYYY-MM-DD format"
        assert count_expenses(db_conn) == 0

    def test_every_field_is_required(self, api, tokens):
        error = assert_error(api.post("/expenses", token=tokens["manager"], body={}), 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"project_id", "category", "description", "amount", "expense_date"}

    def test_unknown_project(self, api, tokens, db_conn):
        result = api.post("/expenses", token=tokens["manager"], body=expense_body(999))
        assert_error(result, 400, "VALIDATION_ERROR", "project_id")
        assert count_expenses(db_conn) == 0

    def test_malformed_json(self, api, tokens):
        assert_error(api.post("/expenses", token=tokens["manager"], raw_body="{bad"), 400, "INVALID_JSON")

    def test_body_must_be_a_json_object(self, api, tokens):
        assert_error(api.post("/expenses", token=tokens["manager"], raw_body="42"), 400, "VALIDATION_ERROR", "body")


class TestListExpenses:
    def test_sorted_by_date_desc_then_id_desc(self, api, tokens, db_conn, apollo):
        older = add_expense(db_conn, apollo, expense_date="2026-01-10")
        same_day_first = add_expense(db_conn, apollo, expense_date="2026-03-01")
        same_day_second = add_expense(db_conn, apollo, expense_date="2026-03-01")
        newest = add_expense(db_conn, apollo, expense_date="2026-04-01")
        result = api.get("/expenses", token=tokens["viewer"])
        assert result.status == 200
        assert ids(result) == [newest, same_day_second, same_day_first, older] and result.body["total"] == 4
        first = result.body["items"][0]
        assert set(first) == EXPENSE_FIELDS
        assert (first["project_name"], first["amount"], first["expense_date"]) == ("Apollo CRM", 100.0, "2026-04-01")

    def test_empty_list(self, api, tokens):
        assert api.get("/expenses", token=tokens["viewer"]).body == {"items": [], "total": 0}

    def test_filters_by_project_and_category(self, api, tokens, db_conn, apollo):
        zeus = add_project(db_conn, "Zeus Portal")
        software = add_expense(db_conn, apollo, category="software")
        travel = add_expense(db_conn, apollo, category="travel")
        other_project = add_expense(db_conn, zeus, category="travel")
        assert ids(api.get("/expenses", token=tokens["viewer"], query={"project_id": apollo})) == [travel, software]
        assert ids(api.get("/expenses", token=tokens["viewer"], query={"category": "travel"})) == [
            other_project,
            travel,
        ]
        assert (
            ids(api.get("/expenses", token=tokens["viewer"], query={"project_id": zeus, "category": "software"})) == []
        )

    def test_date_range_is_inclusive(self, api, tokens, db_conn, apollo):
        jan_31 = add_expense(db_conn, apollo, expense_date="2026-01-31")
        feb_01 = add_expense(db_conn, apollo, expense_date="2026-02-01")
        feb_28 = add_expense(db_conn, apollo, expense_date="2026-02-28")
        mar_01 = add_expense(db_conn, apollo, expense_date="2026-03-01")

        def listed(**query):
            return ids(api.get("/expenses", token=tokens["viewer"], query=query))

        assert listed(date_from="2026-02-01", date_to="2026-02-28") == [feb_28, feb_01]
        assert listed(date_from="2026-02-28") == [mar_01, feb_28]
        assert listed(date_to="2026-02-01") == [feb_01, jan_31]
        assert listed(date_from="2026-02-01", date_to="2026-02-01") == [feb_01]

    def test_reversed_date_range_is_rejected(self, api, tokens):
        result = api.get(
            "/expenses", token=tokens["viewer"], query={"date_from": "2026-03-01", "date_to": "2026-02-01"}
        )
        error = assert_error(result, 400, "VALIDATION_ERROR", "date_to")
        assert error["details"]["date_to"] == "Must be on or after date_from"

    def test_search_in_description(self, api, tokens, db_conn, apollo):
        licences = add_expense(db_conn, apollo, description="CRM licences")
        add_expense(db_conn, apollo, description="Flights to Berlin")
        deposit = add_expense(db_conn, apollo, description="50% deposit")

        def found(term):
            return ids(api.get("/expenses", token=tokens["viewer"], query={"search": term}))

        assert found("LICENCE") == [licences]
        assert found("%") == [deposit]  # LIKE wildcards are matched literally
        assert found("software") == []  # the category is not searched

    def test_filters_combine(self, api, tokens, db_conn, apollo):
        match = add_expense(db_conn, apollo, category="travel", description="Flights", expense_date="2026-05-10")
        add_expense(db_conn, apollo, category="travel", description="Flights", expense_date="2026-07-10")
        add_expense(db_conn, apollo, category="other", description="Flights", expense_date="2026-05-10")
        query = {"project_id": apollo, "category": "travel", "search": "flight"}
        dates = {"date_from": "2026-05-01", "date_to": "2026-05-31"}
        assert ids(api.get("/expenses", token=tokens["viewer"], query={**query, **dates})) == [match]

    @pytest.mark.parametrize(
        "name, value",
        [("project_id", "abc"), ("category", "food"), ("date_from", "2026-13-01"), ("date_to", "yesterday")],
    )
    def test_invalid_filter_values(self, api, tokens, name, value):
        assert_error(api.get("/expenses", token=tokens["viewer"], query={name: value}), 400, "VALIDATION_ERROR", name)


class TestGetExpense:
    def test_returns_expense(self, api, tokens, db_conn, apollo):
        expense = add_expense(db_conn, apollo, category="hardware", description="Laptops", amount="2400.99")
        result = api.get(f"/expenses/{expense}", token=tokens["viewer"])
        assert result.status == 200 and set(result.body) == EXPENSE_FIELDS
        assert (result.body["id"], result.body["category"], result.body["amount"]) == (expense, "hardware", 2400.99)

    def test_unknown_expense_is_404(self, api, tokens):
        assert_error(api.get("/expenses/999", token=tokens["viewer"]), 404, "NOT_FOUND")


class TestUpdateExpense:
    def test_full_update_is_persisted(self, api, tokens, db_conn, apollo):
        zeus = add_project(db_conn, "Zeus Portal")
        expense = add_expense(db_conn, apollo)
        db_conn.execute("UPDATE expenses SET created_at = %s, updated_at = %s WHERE id = %s", (PAST, PAST, expense))
        body = expense_body(zeus, category="travel", description=" Flights ", amount=850.75, expense_date="2026-05-20")

        result = api.put(f"/expenses/{expense}", token=tokens["contributor"], body=body)
        assert result.status == 200 and set(result.body) == EXPENSE_FIELDS
        assert {key: result.body[key] for key in EXPENSE_FIELDS - {"id", "created_at", "updated_at"}} == {
            "project_id": zeus,
            "project_name": "Zeus Portal",
            "category": "travel",
            "description": "Flights",
            "amount": 850.75,
            "expense_date": "2026-05-20",
        }
        row = stored(db_conn, expense)
        assert (row["project_id"], row["amount"], row["expense_date"]) == (zeus, Decimal("850.75"), date(2026, 5, 20))
        assert row["created_at"] == PAST and row["updated_at"] > PAST

    def test_accepts_an_object_it_returned(self, api, tokens, db_conn, apollo):
        expense = add_expense(db_conn, apollo)
        received = api.get(f"/expenses/{expense}", token=tokens["manager"]).body
        result = api.put(f"/expenses/{expense}", token=tokens["manager"], body={**received, "amount": 99.99})
        assert result.status == 200 and result.body["amount"] == 99.99

    def test_unknown_project_in_body(self, api, tokens, db_conn, apollo):
        expense = add_expense(db_conn, apollo)
        result = api.put(f"/expenses/{expense}", token=tokens["manager"], body=expense_body(999))
        assert_error(result, 400, "VALIDATION_ERROR", "project_id")
        assert stored(db_conn, expense)["project_id"] == apollo

    @pytest.mark.parametrize(
        "field, value",
        [
            ("amount", 0),
            ("amount", 10.005),
            ("category", "misc"),
            ("description", ""),
            ("expense_date", 0),
            ("project_id", True),
        ],
    )
    def test_invalid_values(self, api, tokens, db_conn, apollo, field, value):
        expense = add_expense(db_conn, apollo)
        result = api.put(f"/expenses/{expense}", token=tokens["manager"], body=expense_body(apollo, **{field: value}))
        assert_error(result, 400, "VALIDATION_ERROR", field)
        assert stored(db_conn, expense)["amount"] == Decimal("100.00")

    def test_put_is_a_full_update(self, api, tokens, db_conn, apollo):
        expense = add_expense(db_conn, apollo)
        result = api.put(f"/expenses/{expense}", token=tokens["manager"], body={"amount": 5})
        error = assert_error(result, 400, "VALIDATION_ERROR")
        assert set(error["details"]) == {"project_id", "category", "description", "expense_date"}

    def test_unknown_expense_is_404(self, api, tokens, apollo):
        assert_error(api.put("/expenses/999", token=tokens["manager"], body=expense_body(apollo)), 404, "NOT_FOUND")

    def test_malformed_json(self, api, tokens, db_conn, apollo):
        expense = add_expense(db_conn, apollo)
        assert_error(api.put(f"/expenses/{expense}", token=tokens["manager"], raw_body="{"), 400, "INVALID_JSON")


class TestDeleteExpense:
    def test_deletes_expense(self, api, tokens, db_conn, apollo):
        expense = add_expense(db_conn, apollo)
        kept = add_expense(db_conn, apollo)
        result = api.delete(f"/expenses/{expense}", token=tokens["manager"])
        assert result.status == 204 and result.raw == ""
        assert [row["id"] for row in db_conn.execute("SELECT id FROM expenses").fetchall()] == [kept]
        assert_error(api.get(f"/expenses/{expense}", token=tokens["manager"]), 404, "NOT_FOUND")

    def test_unknown_expense_is_404(self, api, tokens):
        assert_error(api.delete("/expenses/999", token=tokens["admin"]), 404, "NOT_FOUND")


class TestIsoDate:
    """``IsoDate`` is a pure validation type (no database access)."""

    @pytest.mark.parametrize("text, expected", [("2026-02-15", date(2026, 2, 15)), ("2028-02-29", date(2028, 2, 29))])
    def test_accepts_real_yyyy_mm_dd_dates(self, text, expected):
        assert TypeAdapter(IsoDate).validate_python(text) == expected

    @pytest.mark.parametrize(
        "value", ["2026-02-29", "2026-13-01", " 2026-02-15", "2026-2-15", "٢٠٢٦-٠٢-١٥", 0, 1.5, None]
    )
    def test_rejects_anything_else(self, value):
        with pytest.raises(PydanticValidationError):
            TypeAdapter(IsoDate).validate_python(value)


class TestBudgetTracking:
    """A project's budget_spent is the sum of its expenses (read model: app.projects.metrics)."""

    def _budget(self, db_conn, project_id):
        project = db_conn.execute("SELECT * FROM projects WHERE id = %s", (project_id,)).fetchone()
        metrics = fetch_project_metrics(db_conn, [project_id], today=TODAY)
        return enrich_project(project, metrics.get(project_id), today=TODAY)

    def test_budget_spent_follows_expense_changes(self, api, tokens, db_conn):
        apollo = add_project(db_conn, "Apollo CRM", budget=1000)
        zeus = add_project(db_conn, "Zeus Portal", budget=500)
        add_expense(db_conn, zeus, amount="400.00")  # other projects never count
        token = tokens["manager"]
        first = api.post("/expenses", token=token, body=expense_body(apollo, amount=250.25)).body
        api.post("/expenses", token=token, body=expense_body(apollo, amount=500))

        budget = self._budget(db_conn, apollo)
        assert (budget["budget_spent"], budget["budget_remaining"]) == (Decimal("750.25"), Decimal("249.75"))
        assert (budget["budget_used_percent"], budget["over_budget"]) == (75.0, False)

        api.put(f"/expenses/{first['id']}", token=token, body={**first, "amount": 600})
        budget = self._budget(db_conn, apollo)
        assert (budget["budget_spent"], budget["budget_used_percent"]) == (Decimal("1100.00"), 110.0)
        assert budget["over_budget"] is True

        api.delete(f"/expenses/{first['id']}", token=token)
        assert self._budget(db_conn, apollo)["budget_spent"] == Decimal("500.00")
        assert self._budget(db_conn, zeus)["budget_spent"] == Decimal("400.00")

    def test_moving_an_expense_moves_the_spend(self, api, tokens, db_conn):
        apollo = add_project(db_conn, "Apollo CRM", budget=1000)
        zeus = add_project(db_conn, "Zeus Portal", budget=1000)
        expense = api.post("/expenses", token=tokens["manager"], body=expense_body(apollo, amount=300)).body
        api.put(f"/expenses/{expense['id']}", token=tokens["manager"], body={**expense, "project_id": zeus})
        assert self._budget(db_conn, apollo)["budget_spent"] == Decimal("0.00")
        assert self._budget(db_conn, zeus)["budget_spent"] == Decimal("300.00")


# RBAC: action -> (method, path, permission, status when allowed)
ACTIONS = {
    "list": ("GET", "/expenses", "expenses:read", 200),
    "get": ("GET", "/expenses/{id}", "expenses:read", 200),
    "create": ("POST", "/expenses", "expenses:create", 201),
    "update": ("PUT", "/expenses/{id}", "expenses:update", 200),
    "delete": ("DELETE", "/expenses/{id}", "expenses:delete", 204),
}
ALLOWED = {
    "admin": set(ACTIONS),
    "manager": set(ACTIONS),
    "contributor": {"list", "get", "create", "update"},
    "viewer": {"list", "get"},
}


class TestPermissions:
    def _call(self, api, db_conn, action, token):
        apollo = add_project(db_conn, "Apollo CRM")
        expense = add_expense(db_conn, apollo)
        method, path, _, _ = ACTIONS[action]
        body = expense_body(apollo, amount=7) if method in ("POST", "PUT") else None
        return api.request(method, path.format(id=expense), token=token, body=body)

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
            rows = db_conn.execute("SELECT amount FROM expenses").fetchall()
            assert rows == [{"amount": Decimal("100.00")}]  # nothing changed
