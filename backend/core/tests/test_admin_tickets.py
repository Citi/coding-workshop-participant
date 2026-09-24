"""The Facility Admin's view of every ticket: list, filters, triage order and details."""

import pytest


@pytest.fixture
def triage(client, api, create_ticket, jane, eve, loc, engineers, run_sql) -> dict[str, int]:
    """Four tickets from two employees that differ in every filterable field.

    wifi     Jane  P3  network     Building A  open         unassigned
    printer  Eve   P2  printer     Building A  in_progress  Sam
    lamp     Jane  P1  electrical  Building B  closed       Kim
    chair    Eve   P3  furniture   Building B  open         unassigned, escalated
    """
    wifi = create_ticket(jane)["ticket_id"]
    printer = create_ticket(
        eve, title="Printer jam", description="Tray 2 is stuck",
        category="printer", affected_scope="floor", seat_id=None,
    )["ticket_id"]
    lamp = create_ticket(
        jane, title="Lamp broken",
        description="The lobby lights flicker all day.", category="electrical",
        affected_scope="building", building_id=loc["B"], floor_id=None, seat_id=None,
    )["ticket_id"]
    chair = create_ticket(
        eve, title="Chair wobbles", description="One leg is loose",
        category="furniture",
        building_id=loc["B"], floor_id=loc["B1"], seat_id=loc["B101"],
    )["ticket_id"]

    run_sql(
        "UPDATE tickets SET status = 'in_progress', assigned_to_user_id = %s WHERE ticket_id = %s",
        (engineers["sam"], printer),
    )
    run_sql(
        "UPDATE tickets SET status = 'closed', assigned_to_user_id = %s WHERE ticket_id = %s",
        (engineers["kim"], lamp),
    )
    response = client.post(
        f"{api}/tickets/{chair}/escalation", json={"reason": "Unsafe to sit on"}, headers=eve
    )
    assert response.status_code == 200, response.text
    return {"wifi": wifi, "printer": printer, "lamp": lamp, "chair": chair}


def _ids(client, api, headers, **params) -> list[int]:
    response = client.get(f"{api}/admin/tickets", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return [t["ticket_id"] for t in response.json()]


# --- list ---------------------------------------------------------------------


def test_list_shows_every_employees_tickets_in_triage_order(client, api, admin, triage) -> None:
    # P1 first, then P2, then the P3s oldest first.
    assert _ids(client, api, admin) == [
        triage["lamp"], triage["printer"], triage["wifi"], triage["chair"],
    ]


def test_list_puts_the_longest_waiting_first_within_a_priority(
    client, api, admin, jane, create_ticket, run_sql
) -> None:
    first = create_ticket(jane)["ticket_id"]
    second = create_ticket(jane)["ticket_id"]
    run_sql(
        "UPDATE tickets SET created_at = now() - interval '1 day' WHERE ticket_id = %s", (second,)
    )
    urgent = create_ticket(jane, affected_scope="building", floor_id=None, seat_id=None)["ticket_id"]
    assert _ids(client, api, admin) == [urgent, second, first]


def test_list_rows_carry_triage_fields(client, api, admin, triage, engineers) -> None:
    rows = {t["ticket_id"]: t for t in client.get(f"{api}/admin/tickets", headers=admin).json()}

    printer = rows[triage["printer"]]
    assert printer["priority"] == "P2"
    assert printer["created_by_name"] == "Eve Other"
    assert (printer["assigned_to_user_id"], printer["assigned_to_name"]) == (
        engineers["sam"], "Sam Tech",
    )
    assert (printer["building_name"], printer["floor_number"], printer["seat_number"]) == (
        "Building A", 3, None,
    )

    wifi = rows[triage["wifi"]]
    assert (wifi["assigned_to_user_id"], wifi["assigned_to_name"]) == (None, None)
    assert rows[triage["chair"]]["escalation_requested"] is True


# Symbolic ids ("B", "sam") are swapped for real ones in the test, since ids aren't fixed.
@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"status": "in_progress"}, {"printer"}),
        ({"priority": "P1"}, {"lamp"}),
        ({"priority": "P3"}, {"wifi", "chair"}),
        ({"category": "printer"}, {"printer"}),
        ({"building_id": "B"}, {"lamp", "chair"}),
        ({"assignment": "unassigned"}, {"wifi", "chair"}),
        ({"assignment": "assigned"}, {"printer", "lamp"}),
        ({"assigned_to": "sam"}, {"printer"}),
        ({"escalated": "true"}, {"chair"}),
        ({"escalated": "false"}, {"wifi", "printer", "lamp"}),
        ({"view": "active"}, {"wifi", "printer", "chair"}),
        ({"view": "closed"}, {"lamp"}),
        ({"q": "WI-FI"}, {"wifi"}),
        ({"q": "tray"}, {"printer"}),  # in the full description
        ({"q": "FLICKER"}, {"lamp"}),
        ({"q": "eve other"}, {"printer", "chair"}),
        ({"q": "EVE@ACME"}, {"printer", "chair"}),
        ({"q": "nothing matches"}, set()),
        ({"view": "active", "assignment": "unassigned", "priority": "P3"}, {"wifi", "chair"}),
        ({"assignment": "unassigned", "escalated": "true"}, {"chair"}),
        ({"assignment": "unassigned", "assigned_to": "sam"}, set()),
    ],
)
def test_list_filters(client, api, admin, triage, loc, engineers, params, expected) -> None:
    lookups = {"building_id": loc, "assigned_to": engineers}
    resolved = {key: lookups[key][value] if key in lookups else value for key, value in params.items()}
    by_id = {v: k for k, v in triage.items()}
    assert {by_id[i] for i in _ids(client, api, admin, **resolved)} == expected


def test_list_search_matches_ticket_id(client, api, admin, triage) -> None:
    assert _ids(client, api, admin, q=str(triage["chair"])) == [triage["chair"]]


def test_list_is_empty_without_tickets(client, api, admin) -> None:
    assert _ids(client, api, admin) == []


@pytest.mark.parametrize(
    "params",
    [
        {"priority": "P4"},
        {"priority": ""},
        {"category": "plumbing"},
        {"urgency": "high"},  # tickets no longer have an urgency
        {"assignment": "none"},
        {"assigned_to": "0"},
        {"building_id": "abc"},
        {"escalated": "maybe"},
        {"view": "all"},
        {"q": "x" * 101},
        {"unknown": "x"},
    ],
)
def test_list_rejects_unknown_filter_values(client, api, admin, params) -> None:
    assert client.get(f"{api}/admin/tickets", headers=admin, params=params).status_code == 422


# --- details ------------------------------------------------------------------


def test_details_include_priority_and_requester_contact(
    client, api, admin, triage, jane_user, run_sql
) -> None:
    run_sql("UPDATE users SET phone_number = '555-0100' WHERE user_id = %s", (jane_user["user_id"],))

    response = client.get(f"{api}/admin/tickets/{triage['lamp']}", headers=admin)

    assert response.status_code == 200
    detail = response.json()
    assert detail["priority"] == "P1"
    assert detail["status"] == "closed"
    assert detail["description"] == "The lobby lights flicker all day."
    assert (detail["created_by_name"], detail["created_by_email"], detail["created_by_phone"]) == (
        "Jane Doe", "jane@acme.inc", "555-0100",
    )
    assert detail["assigned_to_name"] == "Kim Fixit"
    assert (detail["building_name"], detail["floor_number"], detail["seat_number"]) == (
        "Building B", None, None,
    )


def test_details_show_the_escalation_reason(client, api, admin, triage) -> None:
    detail = client.get(f"{api}/admin/tickets/{triage['chair']}", headers=admin).json()
    assert detail["escalation_requested"] is True
    assert detail["escalation_reason"] == "Unsafe to sit on"
    assert detail["created_by_phone"] is None


def test_details_of_a_missing_ticket(client, api, admin) -> None:
    response = client.get(f"{api}/admin/tickets/999", headers=admin)
    assert response.status_code == 404
    assert response.json() == {"detail": "Ticket not found"}


@pytest.mark.parametrize("ticket_id", ["0", "abc", "2147483648"])
def test_details_reject_bad_ids(client, api, admin, ticket_id) -> None:
    assert client.get(f"{api}/admin/tickets/{ticket_id}", headers=admin).status_code == 422


# --- notes and history ----------------------------------------------------------


def test_admin_reads_every_note_on_a_ticket(
    client, api, admin, jane, jane_user, create_ticket, engineers, run_sql
) -> None:
    ticket_id = create_ticket(jane)["ticket_id"]
    client.post(f"{api}/tickets/{ticket_id}/notes", json={"note_text": "Still dropping"}, headers=jane)
    # Engineers can't post notes through the API yet.
    run_sql(
        "INSERT INTO ticket_notes (ticket_id, user_id, note_text, created_at) "
        "VALUES (%s, %s, 'Replacing the access point', now() + interval '1 minute')",
        (ticket_id, engineers["sam"]),
    )

    response = client.get(f"{api}/admin/tickets/{ticket_id}/notes", headers=admin)

    assert response.status_code == 200
    assert [(n["author_name"], n["author_role"], n["note_text"]) for n in response.json()] == [
        ("Jane Doe", "employee", "Still dropping"),
        ("Sam Tech", "engineer", "Replacing the access point"),
    ]


def test_admins_cannot_add_notes_yet(client, api, admin, jane, create_ticket) -> None:
    ticket_id = create_ticket(jane)["ticket_id"]
    response = client.post(
        f"{api}/admin/tickets/{ticket_id}/notes", json={"note_text": "hi"}, headers=admin
    )
    assert response.status_code == 405


def test_admin_reads_the_status_history(client, api, admin, jane, create_ticket) -> None:
    ticket_id = create_ticket(jane)["ticket_id"]

    response = client.get(f"{api}/admin/tickets/{ticket_id}/history", headers=admin)

    assert response.status_code == 200
    assert [(h["from_status"], h["to_status"], h["changed_by_name"]) for h in response.json()] == [
        (None, "open", "Jane Doe"),
    ]


@pytest.mark.parametrize("suffix", ["notes", "history"])
def test_notes_and_history_of_a_missing_ticket(client, api, admin, suffix) -> None:
    response = client.get(f"{api}/admin/tickets/999/{suffix}", headers=admin)
    assert response.status_code == 404
    assert response.json() == {"detail": "Ticket not found"}
