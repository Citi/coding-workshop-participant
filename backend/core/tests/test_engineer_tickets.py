"""An engineer's own queue: only their assigned tickets, filters, details, notes and history."""

import pytest

from tests.conftest import bearer


def _assign(run_sql, ticket_id, engineer_id, status="open") -> None:
    run_sql(
        "UPDATE tickets SET assigned_to_user_id = %s, status = %s WHERE ticket_id = %s",
        (engineer_id, status, ticket_id),
    )


@pytest.fixture
def queue(create_ticket, jane, eve, loc, engineers, run_sql) -> dict[str, int]:
    """Sam's three tickets, plus one of Kim's and one nobody has.

    lights  Jane  P1  Building A  open         Sam
    wifi    Eve   P3  Building A  in_progress  Sam
    lamp    Jane  P1  Building B  closed       Sam
    kims    Jane  P3  Building A  open         Kim
    loose   Jane  P3  Building A  open         unassigned
    """
    building = {"affected_scope": "building", "floor_id": None, "seat_id": None}
    lights = create_ticket(jane, title="Lobby lights out", description="The lobby is dark.", **building)
    wifi = create_ticket(eve)
    lamp = create_ticket(jane, title="Lamp broken", building_id=loc["B"], **building)
    kims = create_ticket(jane, title="Kim's ticket")
    loose = create_ticket(jane, title="Nobody's ticket")
    _assign(run_sql, lights["ticket_id"], engineers["sam"])
    _assign(run_sql, wifi["ticket_id"], engineers["sam"], "in_progress")
    _assign(run_sql, lamp["ticket_id"], engineers["sam"], "closed")
    _assign(run_sql, kims["ticket_id"], engineers["kim"])
    return {name: t["ticket_id"] for name, t in {
        "lights": lights, "wifi": wifi, "lamp": lamp, "kims": kims, "loose": loose,
    }.items()}


def _ids(client, api, headers, **params) -> list[int]:
    response = client.get(f"{api}/engineer/tickets", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return [t["ticket_id"] for t in response.json()]


# --- queue ------------------------------------------------------------------------


def test_the_queue_is_only_my_tickets_in_triage_order(client, api, sam, kim, queue) -> None:
    assert _ids(client, api, sam) == [queue["lights"], queue["lamp"], queue["wifi"]]
    assert _ids(client, api, kim) == [queue["kims"]]


def test_queue_rows_carry_priority_and_requester(client, api, sam, queue, engineers) -> None:
    rows = {t["ticket_id"]: t for t in client.get(f"{api}/engineer/tickets", headers=sam).json()}
    wifi = rows[queue["wifi"]]
    assert (wifi["priority"], wifi["status"], wifi["created_by_name"]) == ("P3", "in_progress", "Eve Other")
    assert (wifi["assigned_to_user_id"], wifi["assigned_to_name"]) == (engineers["sam"], "Sam Tech")
    assert rows[queue["lights"]]["priority"] == "P1"


def test_an_engineer_with_nothing_assigned_has_an_empty_queue(client, api, register, set_role, queue) -> None:
    new = register("new@acme.inc", "New Engineer")
    set_role(new["user_id"], "engineer")
    assert _ids(client, api, bearer({**new, "role": "engineer"})) == []


# Symbolic "B" is swapped for the real building id, since ids aren't fixed.
@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"view": "active"}, {"lights", "wifi"}),
        ({"view": "closed"}, {"lamp"}),
        ({"status": "in_progress"}, {"wifi"}),
        ({"priority": "P1"}, {"lights", "lamp"}),
        ({"priority": "P1", "view": "active"}, {"lights"}),
        ({"building_id": "B"}, {"lamp"}),
        ({"q": "LOBBY"}, {"lights"}),
        ({"q": "eve other"}, {"wifi"}),
        ({"q": "kim's"}, set()),
        ({"q": "nobody"}, set()),
    ],
)
def test_queue_filters(client, api, sam, queue, loc, params, expected) -> None:
    resolved = {k: loc[v] if k == "building_id" else v for k, v in params.items()}
    by_id = {v: k for k, v in queue.items()}
    assert {by_id[i] for i in _ids(client, api, sam, **resolved)} == expected


def test_queue_search_matches_ticket_id(client, api, sam, queue) -> None:
    assert _ids(client, api, sam, q=str(queue["wifi"])) == [queue["wifi"]]
    # Someone else's ticket id finds nothing.
    assert _ids(client, api, sam, q=str(queue["kims"])) == []


@pytest.mark.parametrize(
    "params",
    [
        {"assigned_to": "1"},
        {"assignment": "unassigned"},
        {"priority": "P4"},
        {"view": "all"},
        {"building_id": "0"},
        {"q": "x" * 101},
    ],
)
def test_queue_rejects_unknown_filters(client, api, sam, params) -> None:
    assert client.get(f"{api}/engineer/tickets", headers=sam, params=params).status_code == 422


# --- details ----------------------------------------------------------------------


def test_details_of_my_ticket_include_priority_and_requester_contact(
    client, api, sam, queue, eve_user, run_sql
) -> None:
    run_sql("UPDATE users SET phone_number = '555-0199' WHERE user_id = %s", (eve_user["user_id"],))

    response = client.get(f"{api}/engineer/tickets/{queue['wifi']}", headers=sam)

    assert response.status_code == 200
    detail = response.json()
    assert (detail["priority"], detail["status"]) == ("P3", "in_progress")
    assert detail["assigned_to_name"] == "Sam Tech"
    assert (detail["created_by_name"], detail["created_by_email"], detail["created_by_phone"]) == (
        "Eve Other", "eve@acme.inc", "555-0199",
    )


@pytest.mark.parametrize("which", ["kims", "loose", "missing"])
def test_tickets_that_are_not_mine_look_missing(client, api, sam, queue, which) -> None:
    ticket_id = queue.get(which, 999)
    for suffix in ("", "/notes", "/history"):
        response = client.get(f"{api}/engineer/tickets/{ticket_id}{suffix}", headers=sam)
        assert response.status_code == 404, suffix
        assert response.json() == {"detail": "Ticket not found"}


def test_a_ticket_reassigned_away_disappears(client, api, sam, kim, admin, queue, engineers) -> None:
    moved = client.put(
        f"{api}/admin/tickets/{queue['lights']}/assignment",
        json={"engineer_id": engineers["kim"]},
        headers=admin,
    )
    assert moved.status_code == 200

    assert client.get(f"{api}/engineer/tickets/{queue['lights']}", headers=sam).status_code == 404
    assert queue["lights"] not in _ids(client, api, sam)
    assert queue["lights"] in _ids(client, api, kim)


def test_history_of_my_ticket(client, api, sam, queue) -> None:
    response = client.get(f"{api}/engineer/tickets/{queue['lights']}/history", headers=sam)
    assert response.status_code == 200
    assert [(h["from_status"], h["to_status"], h["changed_by_name"]) for h in response.json()] == [
        (None, "open", "Jane Doe"),
    ]


# --- notes ------------------------------------------------------------------------


def test_engineer_adds_a_note_the_employee_can_read(client, api, sam, jane, queue, run_sql) -> None:
    before = run_sql("SELECT updated_at FROM tickets WHERE ticket_id = %s", (queue["lights"],))[0]
    client.post(f"{api}/tickets/{queue['lights']}/notes", json={"note_text": "Still dark."}, headers=jane)

    response = client.post(
        f"{api}/engineer/tickets/{queue['lights']}/notes",
        json={"note_text": "  Replacing the breaker this afternoon.  "},
        headers=sam,
    )

    assert response.status_code == 201, response.text
    note = response.json()
    assert (note["author_name"], note["author_role"], note["note_text"]) == (
        "Sam Tech", "engineer", "Replacing the breaker this afternoon.",
    )
    after = run_sql("SELECT updated_at FROM tickets WHERE ticket_id = %s", (queue["lights"],))[0]
    assert after["updated_at"] > before["updated_at"]

    mine = client.get(f"{api}/engineer/tickets/{queue['lights']}/notes", headers=sam).json()
    theirs = client.get(f"{api}/tickets/{queue['lights']}/notes", headers=jane).json()
    assert [n["author_role"] for n in mine] == ["employee", "engineer"]
    assert theirs == mine


@pytest.mark.parametrize("status", ["in_progress", "blocked", "resolved"])
def test_notes_are_allowed_until_the_ticket_is_closed(client, api, sam, queue, run_sql, status) -> None:
    run_sql("UPDATE tickets SET status = %s WHERE ticket_id = %s", (status, queue["lights"]))
    response = client.post(
        f"{api}/engineer/tickets/{queue['lights']}/notes", json={"note_text": "Update"}, headers=sam
    )
    assert response.status_code == 201


def test_closed_tickets_take_no_notes(client, api, sam, queue) -> None:
    response = client.post(
        f"{api}/engineer/tickets/{queue['lamp']}/notes", json={"note_text": "Too late"}, headers=sam
    )
    assert response.status_code == 409
    assert response.json() == {"detail": "Closed tickets can't take new notes"}


def test_no_notes_on_someone_elses_ticket(client, api, sam, queue, run_sql) -> None:
    response = client.post(
        f"{api}/engineer/tickets/{queue['kims']}/notes", json={"note_text": "Hi"}, headers=sam
    )
    assert response.status_code == 404
    assert run_sql("SELECT count(*) AS n FROM ticket_notes")[0]["n"] == 0


@pytest.mark.parametrize("body", [{}, {"note_text": "   "}, {"note_text": "x" * 2001}])
def test_note_text_is_validated(client, api, sam, queue, body) -> None:
    response = client.post(f"{api}/engineer/tickets/{queue['lights']}/notes", json=body, headers=sam)
    assert response.status_code == 422
