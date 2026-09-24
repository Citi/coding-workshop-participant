"""Creating, listing and viewing the caller's tickets."""

import pytest


# --- create -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("scope", "location", "priority"),
    [
        ("me", {}, "P3"),
        ("floor", {"seat_id": None}, "P2"),
        ("building", {"floor_id": None, "seat_id": None}, "P1"),
    ],
)
def test_create_stores_priority_from_scope_but_does_not_return_it(
    create_ticket, jane, jane_user, run_sql, scope, location, priority
) -> None:
    ticket = create_ticket(jane, affected_scope=scope, **location)
    stored = run_sql("SELECT priority FROM tickets WHERE ticket_id = %s", (ticket["ticket_id"],))
    assert stored[0]["priority"] == priority
    assert "priority" not in ticket
    assert ticket["status"] == "open"
    assert ticket["created_by_user_id"] == jane_user["user_id"]
    assert ticket["escalation_requested"] is False
    assert ticket["assigned_to_user_id"] is None


def test_create_ignores_server_owned_fields(create_ticket, jane, jane_user, eve_user, run_sql) -> None:
    ticket = create_ticket(
        jane,
        affected_scope="building",
        floor_id=None,
        seat_id=None,
        status="closed",
        priority="P3",
        created_by_user_id=eve_user["user_id"],
    )
    stored = run_sql("SELECT priority FROM tickets WHERE ticket_id = %s", (ticket["ticket_id"],))
    assert (ticket["status"], stored[0]["priority"]) == ("open", "P1")
    assert ticket["created_by_user_id"] == jane_user["user_id"]


@pytest.mark.parametrize(
    ("overrides", "detail"),
    [
        ({"floor_id": "A1"}, "Seat {A301} is not on floor {A1}"),
        ({"building_id": "B"}, "Floor {A3} is not in building {B}"),
        ({"building_id": 999}, "Building 999 does not exist"),
        ({"floor_id": 999}, "Floor 999 does not exist"),
        ({"seat_id": 999}, "Seat 999 does not exist"),
    ],
)
def test_create_checks_the_location_hierarchy(
    client, api, jane, loc, ticket_payload, overrides, detail
) -> None:
    # Values like "A1" are names from the loc fixture; numbers are used as-is.
    resolved = {k: loc[v] if isinstance(v, str) else v for k, v in overrides.items()}
    response = client.post(f"{api}/tickets", json=ticket_payload(**resolved), headers=jane)
    assert response.status_code == 400
    assert response.json() == {"detail": detail.format(**loc)}


@pytest.mark.parametrize(
    "overrides",
    [
        {"seat_id": None},  # scope "me" without a seat
        {"affected_scope": "floor", "floor_id": None, "seat_id": None},
        {"category": "plumbing"},
        {"title": "   "},
        {"description": "x" * 5001},
    ],
)
def test_create_rejects_invalid_input(client, api, jane, ticket_payload, overrides) -> None:
    response = client.post(f"{api}/tickets", json=ticket_payload(**overrides), headers=jane)
    assert response.status_code == 422


def test_create_returns_no_urgency_or_short_description(client, api, jane, ticket_payload) -> None:
    body = client.post(f"{api}/tickets", json=ticket_payload(), headers=jane).json()
    assert "urgency" not in body
    assert "short_description" not in body


def test_create_ignores_urgency_and_short_description_from_old_clients(
    client, api, jane, ticket_payload, run_sql
) -> None:
    # Tickets no longer have these fields. Old clients that still send them aren't
    # rejected; the values are simply dropped.
    payload = ticket_payload(urgency="high", short_description="Old field")
    response = client.post(f"{api}/tickets", json=payload, headers=jane)
    assert response.status_code == 201, response.text
    columns = run_sql(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'tickets'"
    )
    assert {"urgency", "short_description"}.isdisjoint({row["column_name"] for row in columns})


def test_create_requires_a_signed_in_user(client, api, ticket_payload) -> None:
    assert client.post(f"{api}/tickets", json=ticket_payload()).status_code == 401


# --- list ---------------------------------------------------------------------


def _ids(client, api, headers, **params) -> list[int]:
    response = client.get(f"{api}/tickets", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return [t["ticket_id"] for t in response.json()]


def test_list_shows_only_the_callers_tickets(client, api, jane, eve, create_ticket) -> None:
    mine = create_ticket(jane)
    create_ticket(eve)
    assert _ids(client, api, jane) == [mine["ticket_id"]]


def test_list_includes_location_names(client, api, jane, create_ticket) -> None:
    create_ticket(jane)
    item = client.get(f"{api}/tickets", headers=jane).json()[0]
    assert (item["building_name"], item["floor_number"], item["seat_number"]) == (
        "Building A", 3, "301",
    )


def test_list_is_most_recently_updated_first(client, api, jane, create_ticket, run_sql) -> None:
    older = create_ticket(jane)["ticket_id"]
    newer = create_ticket(jane)["ticket_id"]
    assert _ids(client, api, jane) == [newer, older]
    run_sql("UPDATE tickets SET updated_at = now() + interval '1 minute' WHERE ticket_id = %s", (older,))
    assert _ids(client, api, jane) == [older, newer]


@pytest.fixture
def mixed_tickets(create_ticket, jane, run_sql) -> dict[str, int]:
    """Three tickets that differ in status, scope and text."""
    wifi = create_ticket(jane)["ticket_id"]
    printer = create_ticket(
        jane, title="Printer jam", description="Tray 2 is 100% stuck",
        category="printer", affected_scope="floor", seat_id=None,
    )["ticket_id"]
    lamp = create_ticket(
        jane, title="Lamp_broken", description="Flickers",
        affected_scope="building", floor_id=None, seat_id=None,
    )["ticket_id"]
    run_sql("UPDATE tickets SET status = 'closed' WHERE ticket_id = %s", (lamp,))
    return {"wifi": wifi, "printer": printer, "lamp": lamp}


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"view": "active"}, {"wifi", "printer"}),
        ({"view": "closed"}, {"lamp"}),
        ({"status": "open"}, {"wifi", "printer"}),
        ({"q": "WI-FI"}, {"wifi"}),
        ({"q": "tray"}, {"printer"}),  # in the full description
        ({"q": "LAPTOP"}, {"wifi"}),
        ({"q": "%"}, {"printer"}),
        ({"q": "_"}, {"lamp"}),
        ({"q": "nothing matches"}, set()),
        ({"view": "active", "q": "wi-fi"}, {"wifi"}),
        ({"view": "closed", "status": "open"}, set()),
    ],
)
def test_list_filters(client, api, jane, mixed_tickets, params, expected) -> None:
    by_id = {v: k for k, v in mixed_tickets.items()}
    assert {by_id[i] for i in _ids(client, api, jane, **params)} == expected


def test_list_search_matches_ticket_id(client, api, jane, mixed_tickets) -> None:
    assert _ids(client, api, jane, q=str(mixed_tickets["printer"])) == [mixed_tickets["printer"]]


@pytest.mark.parametrize(
    "params", [{"priority": "P1"}, {"priority": ""}, {"urgency": "high"}, {"unknown": "x"}]
)
def test_list_has_no_priority_filter(client, api, jane, params) -> None:
    response = client.get(f"{api}/tickets", headers=jane, params=params)
    assert response.status_code == 422


def test_employee_responses_never_include_priority(client, api, jane, create_ticket) -> None:
    created = create_ticket(jane)
    ticket_id = created["ticket_id"]
    listed = client.get(f"{api}/tickets", headers=jane).json()
    detail = client.get(f"{api}/tickets/{ticket_id}", headers=jane).json()
    escalated = client.post(
        f"{api}/tickets/{ticket_id}/escalation", json={"reason": "Urgent"}, headers=jane
    ).json()

    for body in (created, listed[0], detail, escalated):
        assert "priority" not in body


@pytest.mark.parametrize("params", [{"status": "bogus"}, {"view": "all"}, {"q": "x" * 101}])
def test_list_rejects_unknown_filter_values(client, api, jane, params) -> None:
    assert client.get(f"{api}/tickets", headers=jane, params=params).status_code == 422


# --- details ------------------------------------------------------------------


def test_details_include_names_and_assigned_engineer(
    client, api, jane, register, create_ticket, run_sql
) -> None:
    ticket = create_ticket(jane)
    sam = register("sam@acme.inc", "Sam Tech")
    run_sql(
        "UPDATE tickets SET assigned_to_user_id = %s, status = 'in_progress' WHERE ticket_id = %s",
        (sam["user_id"], ticket["ticket_id"]),
    )

    response = client.get(f"{api}/tickets/{ticket['ticket_id']}", headers=jane)

    assert response.status_code == 200
    detail = response.json()
    assert detail["description"] == ticket["description"]
    assert detail["assigned_to_name"] == "Sam Tech"
    assert detail["status"] == "in_progress"
    assert (detail["building_name"], detail["floor_number"], detail["seat_number"]) == (
        "Building A", 3, "301",
    )


def test_details_of_unassigned_building_ticket(client, api, jane, create_ticket) -> None:
    ticket = create_ticket(jane, affected_scope="building", floor_id=None, seat_id=None)
    detail = client.get(f"{api}/tickets/{ticket['ticket_id']}", headers=jane).json()
    assert detail["assigned_to_name"] is None
    assert detail["floor_number"] is None and detail["seat_number"] is None


def test_someone_elses_ticket_looks_like_a_missing_one(client, api, jane, eve, create_ticket) -> None:
    ticket = create_ticket(jane)
    others = client.get(f"{api}/tickets/{ticket['ticket_id']}", headers=eve)
    missing = client.get(f"{api}/tickets/999", headers=jane)
    assert others.status_code == missing.status_code == 404
    assert others.json() == missing.json() == {"detail": "Ticket not found"}
