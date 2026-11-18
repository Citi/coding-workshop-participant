"""Who gets notified about which change - and never the person who made it."""

from tests.integration.conftest import AC, DOCK, TAP, USERS, WIFI, unread


def messages(client, headers):
    return [n["message"] for n in unread(client, headers)]


def test_seed_starts_with_no_notifications(client, as_):
    for who in ("alice", "emma", "ethan"):
        assert client.get("/notifications/unread-count", headers=as_(who)).json() == {"unread_count": 0}


def test_new_incident_notifies_admins_only(client, as_, new_incident):
    inc = new_incident()
    [n] = unread(client, as_("alice"))
    assert n["message"] == f"Emma Employee reported {inc['reference']}: Projector has no signal"
    assert n["incident_id"] == inc["id"] and n["actor_name"] == "Emma Employee" and n["kind"] == "incident_created"
    assert unread(client, as_("emma")) == []


def test_public_note_reaches_reporter_not_the_author(client, as_):
    client.post(f"/incidents/{AC}/notes", headers=as_("ethan"), json={"body": "Part arrives Monday"})
    assert messages(client, as_("emma")) == ['Ethan Electrics added a note on INC-000004: "Part arrives Monday"']
    assert unread(client, as_("ethan")) == []
    assert unread(client, as_("alice")) == []  # assigned ticket: engineer + reporter only


def test_internal_note_never_reaches_employee(client, as_):
    client.post(f"/incidents/{AC}/notes", headers=as_("ethan"), json={"body": "Compressor is old", "is_internal": True})
    assert unread(client, as_("emma")) == []
    assert messages(client, as_("alice")) == ['Ethan Electrics added an internal note on INC-000004: "Compressor is old"']


def test_resolution_asks_reporter_to_confirm(client, as_):
    client.post(f"/incidents/{AC}/status", headers=as_("ethan"), json={"status": "resolved"})
    [msg] = messages(client, as_("emma"))
    assert msg == "Ethan Electrics moved INC-000004 from In progress to Resolved. Please confirm the fix or reopen it"


def test_reassignment_notifies_new_and_previous_engineer_and_reporter(client, as_):
    client.post(f"/incidents/{DOCK}/assign", headers=as_("alice"), json={"engineer_id": USERS["ethan"][0]})
    assert messages(client, as_("ethan")) == ["Alice Admin assigned INC-000006 to you: Docking station not detecting monitors"]
    assert messages(client, as_("tom")) == ["Alice Admin reassigned INC-000006 to Ethan Electrics"]
    assert messages(client, as_("sofia")) == ["Ethan Electrics is now working on your incident INC-000006"]


def test_escalation_alerts_staff(client, as_):
    client.post(f"/incidents/{AC}/escalate", headers=as_("emma"), json={"reason": "Too hot", "requested_priority": "high"})
    expected = ["Emma Employee escalated INC-000004 and requested High priority"]
    assert messages(client, as_("alice")) == expected
    assert messages(client, as_("ethan")) == expected


def test_admin_decisions_reach_reporter(client, as_):
    client.patch(f"/incidents/{WIFI}", headers=as_("alice"), json={"priority": "critical", "is_escalated": False})
    msgs = messages(client, as_("sofia"))
    assert "Alice Admin changed the priority of INC-000007 from High to Critical" in msgs
    assert "Alice Admin reviewed and cleared the escalation on INC-000007" in msgs


def test_detail_edits_on_unassigned_incident_reach_admins(client, as_, new_incident):
    inc = new_incident()
    client.post("/notifications/read-all", headers=as_("alice"))
    client.patch(f"/incidents/{inc['id']}", headers=as_("emma"), json={"title": "Projector dead", "floor_id": None, "seat_id": None})
    [msg] = messages(client, as_("alice"))
    assert msg.startswith("Emma Employee updated title, floor, seat on")


def test_deleted_incident_notice_has_no_link(client, as_):
    client.delete(f"/incidents/{TAP}", headers=as_("alice"))
    [n] = unread(client, as_("liam"))
    assert n["incident_id"] is None and n["incident_ref"] == "INC-000005"
    assert n["message"] == "Alice Admin deleted INC-000005: Leaking tap in kitchen"


def test_mark_read_one_by_incident_and_all(client, as_, new_incident):
    alice = as_("alice")
    first, second = new_incident(), new_incident(reporter="liam")
    client.post(f"/incidents/{WIFI}/notes", headers=as_("sofia"), json={"body": "Still dropping"})  # unassigned -> admins
    assert client.get("/notifications/unread-count", headers=alice).json()["unread_count"] == 3

    newest = unread(client, alice)[0]
    assert newest["incident_id"] == WIFI
    assert client.post(f"/notifications/{newest['id']}/read", headers=alice).json() == {"unread_count": 2}
    r = client.post("/notifications/read-all", headers=alice, params={"incident_id": first["id"]})
    assert r.json() == {"unread_count": 1}
    assert [n["incident_id"] for n in unread(client, alice)] == [second["id"]]
    assert client.post("/notifications/read-all", headers=alice).json() == {"unread_count": 0}

    everything = client.get("/notifications", headers=alice).json()
    assert len(everything["items"]) == 3 and everything["unread_count"] == 0


def test_cannot_touch_someone_elses_notification(client, as_, new_incident):
    new_incident()
    n = unread(client, as_("alice"))[0]
    r = client.post(f"/notifications/{n['id']}/read", headers=as_("emma"))
    assert r.status_code == 404 and r.json() == {"message": "Notification not found."}
    assert client.post("/notifications/9999/read", headers=as_("alice")).status_code == 404
