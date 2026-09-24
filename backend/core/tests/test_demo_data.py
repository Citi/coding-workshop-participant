"""The demo data the setup task loads with "demo_data": true."""

from collections import Counter
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

import demo_data
import setup_tasks
from function import handler
from services.engineer_ticket_service import ALLOWED_MOVES
from tests.conftest import bearer

ADMIN = {"admin_email": "boss@acme.inc", "admin_password": "demo-password-1"}

# The admin finishes resolved tickets: close them, or send them back to the engineer.
ADMIN_MOVES = {("resolved", "closed"), ("resolved", "in_progress")}

Rows = Callable[..., list[dict[str, Any]]]


def seed(**fields: Any) -> dict[str, Any]:
    """Invoke the Lambda handler the way the AWS CLI does."""
    return handler({"setup_task": "seed", **fields}, None)


@pytest.fixture
def loaded() -> dict[str, Any]:
    """Seed with an admin and the demo data, and return the summary."""
    result = seed(**ADMIN, demo_data=True)
    assert result["ok"] is True, result
    return result


def test_summary_counts_what_was_added(loaded: dict[str, Any], run_sql: Rows) -> None:
    """2 engineers and 5 employees join the admin, with 25 tickets."""
    assert loaded["demo_data"] == {"created": True, "people": 7, "tickets": 25}
    roles = run_sql(
        "SELECT r.role_name, count(*) AS n FROM users u JOIN roles r USING (role_id) "
        "GROUP BY r.role_name ORDER BY r.role_name"
    )
    assert roles == [
        {"role_name": "admin", "n": 1},
        {"role_name": "employee", "n": 5},
        {"role_name": "engineer", "n": 2},
    ]
    assert run_sql("SELECT count(*) AS n FROM tickets") == [{"n": 25}]


@pytest.mark.usefixtures("loaded")
def test_every_workflow_state_has_examples(run_sql: Rows) -> None:
    """Each status, unassigned work, escalations and every priority show up on the dashboards."""
    statuses = Counter(row["status"] for row in run_sql("SELECT status FROM tickets"))
    assert set(statuses) == {"open", "in_progress", "blocked", "resolved", "closed"}
    assert min(statuses.values()) >= 3

    open_rows = run_sql("SELECT assigned_to_user_id FROM tickets WHERE status = 'open'")
    assert any(row["assigned_to_user_id"] is None for row in open_rows)
    assert any(row["assigned_to_user_id"] is not None for row in open_rows)
    assert run_sql(
        "SELECT count(*) AS n FROM tickets WHERE escalation_requested AND status <> 'closed'"
    )[0]["n"] >= 2
    assert {row["priority"] for row in run_sql("SELECT priority FROM tickets")} == {"P1", "P2", "P3"}


@pytest.mark.usefixtures("loaded")
def test_background_accounts_cannot_sign_in(client: TestClient, api: str) -> None:
    """Only the admin has a known password."""
    for person in demo_data.PEOPLE.values():
        response = client.post(
            f"{api}/auth/login", json={"email": person.email, "password": "password123"}
        )
        assert response.status_code == 401


@pytest.mark.usefixtures("loaded")
def test_history_follows_the_workflow(run_sql: Rows) -> None:
    """Every ticket starts open, moves only as the app allows, and ends on its status."""
    tickets = run_sql(
        "SELECT ticket_id, status, created_by_user_id, created_at FROM tickets"
    )
    roles = {row["user_id"]: row["role_name"] for row in run_sql(
        "SELECT u.user_id, r.role_name FROM users u JOIN roles r USING (role_id)"
    )}
    for ticket in tickets:
        history = run_sql(
            "SELECT from_status, to_status, changed_by_user_id, reason, changed_at "
            "FROM ticket_status_history WHERE ticket_id = %s ORDER BY changed_at, history_id",
            (ticket["ticket_id"],),
        )
        first, moves = history[0], history[1:]
        assert (first["from_status"], first["to_status"]) == (None, "open")
        assert first["changed_by_user_id"] == ticket["created_by_user_id"]
        assert first["changed_at"] == ticket["created_at"]

        previous = "open"
        for step in moves:
            move = (step["from_status"], step["to_status"])
            assert step["from_status"] == previous, ticket
            if roles[step["changed_by_user_id"]] == "admin":
                assert move in ADMIN_MOVES, ticket
            else:
                assert roles[step["changed_by_user_id"]] == "engineer", ticket
                assert step["to_status"] in ALLOWED_MOVES[step["from_status"]], ticket
            if step["to_status"] in ("blocked", "resolved"):
                assert step["reason"], ticket
            previous = step["to_status"]
        assert previous == ticket["status"], ticket


@pytest.mark.usefixtures("loaded")
def test_ticket_fields_agree_with_status(run_sql: Rows) -> None:
    """Fields that depend on the status are set exactly when the app would set them."""
    for t in run_sql("SELECT * FROM tickets"):
        assert (t["resolved_at"] is not None) == (t["status"] in ("resolved", "closed")), t
        assert (t["blocked_reason"] is not None) == (t["status"] == "blocked"), t
        assert (t["escalation_reason"] is not None) == t["escalation_requested"], t
        assert (t["assigned_at"] is not None) == (t["assigned_to_user_id"] is not None), t
        assert (t["acknowledged_at"] is not None) == (t["assigned_to_user_id"] is not None), t
        if t["status"] != "open":
            assert t["assigned_to_user_id"] is not None, t


@pytest.mark.usefixtures("loaded")
def test_engineers_only_work_their_own_tickets(run_sql: Rows) -> None:
    """Engineer moves and notes come from the ticket's engineer; employee notes from its requester."""
    wrong_mover = run_sql(
        "SELECT h.ticket_id FROM ticket_status_history h "
        "JOIN tickets t USING (ticket_id) JOIN users u ON u.user_id = h.changed_by_user_id "
        "JOIN roles r USING (role_id) "
        "WHERE r.role_name = 'engineer' AND h.changed_by_user_id <> t.assigned_to_user_id"
    )
    wrong_author = run_sql(
        "SELECT n.ticket_id FROM ticket_notes n "
        "JOIN tickets t USING (ticket_id) JOIN users u ON u.user_id = n.user_id "
        "JOIN roles r USING (role_id) "
        "WHERE (r.role_name = 'engineer' AND n.user_id <> t.assigned_to_user_id) "
        "   OR (r.role_name = 'employee' AND n.user_id <> t.created_by_user_id) "
        "   OR r.role_name = 'admin'"
    )
    assert wrong_mover == []
    assert wrong_author == []
    assert run_sql("SELECT count(*) AS n FROM ticket_notes")[0]["n"] >= 10


@pytest.mark.usefixtures("loaded")
def test_timestamps_are_in_order_and_in_the_past(run_sql: Rows) -> None:
    """Nothing happens before its ticket was created or after now, and updated_at is the latest."""
    for t in run_sql("SELECT *, now() AS now FROM tickets"):
        events = [
            row["at"]
            for row in run_sql(
                "SELECT changed_at AS at FROM ticket_status_history WHERE ticket_id = %(id)s "
                "UNION ALL SELECT created_at FROM ticket_notes WHERE ticket_id = %(id)s",
                {"id": t["ticket_id"]},
            )
        ]
        stamps = [t["acknowledged_at"], t["assigned_at"], t["resolved_at"], *events]
        for stamp in filter(None, stamps):
            assert t["created_at"] <= stamp <= t["updated_at"] <= t["now"], t


@pytest.mark.usefixtures("loaded")
def test_admin_dashboard_has_something_in_every_tile(client: TestClient, api: str, run_sql: Rows) -> None:
    """The seeded admin sees every ticket and non-zero metrics through the real API."""
    admin = run_sql(
        "SELECT user_id, role_name AS role FROM users JOIN roles USING (role_id) "
        "WHERE email = 'boss@acme.inc'"
    )[0]
    headers = bearer(admin)

    tickets = client.get(f"{api}/admin/tickets", headers=headers)
    metrics = client.get(f"{api}/admin/metrics", headers=headers)

    assert tickets.status_code == 200
    assert len(tickets.json()) == 25
    assert metrics.status_code == 200
    assert all(count > 0 for count in metrics.json().values()), metrics.json()


def test_second_run_adds_nothing(loaded: dict[str, Any], run_sql: Rows) -> None:
    """Seeding again, with or without the admin, leaves the demo data as it was."""
    again = seed(demo_data=True)

    assert again["demo_data"] == {"created": False}
    assert run_sql("SELECT count(*) AS n FROM tickets") == [{"n": 25}]
    assert run_sql("SELECT count(*) AS n FROM users") == [{"n": 8}]


def test_uses_an_existing_admin(run_sql: Rows) -> None:
    """An admin from an earlier run closes the demo tickets, so the password needn't be sent again."""
    seed(**ADMIN)

    result = seed(demo_data=True)

    assert result["demo_data"]["created"] is True
    closers = run_sql(
        "SELECT DISTINCT u.email FROM ticket_status_history h "
        "JOIN users u ON u.user_id = h.changed_by_user_id WHERE h.to_status = 'closed'"
    )
    assert closers == [{"email": "boss@acme.inc"}]


def test_needs_an_admin_and_writes_nothing_without_one(run_sql: Rows) -> None:
    """With no admin anywhere there's nobody to close tickets, so the whole run is undone."""
    run_sql("DELETE FROM seats")

    result = seed(demo_data=True)

    assert result == {
        "ok": False,
        "error": "demo_data needs an admin account: pass admin_email and admin_password",
    }
    assert run_sql("SELECT count(*) AS n FROM users") == [{"n": 0}]
    assert run_sql("SELECT count(*) AS n FROM seats") == [{"n": 0}]


def test_demo_data_flag_must_be_boolean(run_sql: Rows) -> None:
    """A string like "yes" is refused rather than guessed at."""
    assert seed(**ADMIN, demo_data="yes") == {
        "ok": False,
        "error": "demo_data must be true or false",
    }
    assert run_sql("SELECT count(*) AS n FROM users") == [{"n": 0}]


def test_missing_demo_location_undoes_everything(
    monkeypatch: pytest.MonkeyPatch, run_sql: Rows
) -> None:
    """If seed.sql's locations aren't there, nothing is half-loaded."""
    monkeypatch.setattr(setup_tasks, "SEED_FILES", ("schema.sql",))
    run_sql("DELETE FROM seats")

    result = seed(**ADMIN, demo_data=True)

    assert result["ok"] is False
    assert "is missing; run seed.sql first" in result["error"]
    assert run_sql("SELECT count(*) AS n FROM users") == [{"n": 0}]
