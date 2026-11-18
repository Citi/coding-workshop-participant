"""Incident CRUD: list/filter/search, create, read, update, delete - per role."""

import pytest

from tests.integration.conftest import AC, BADGE, CHAIR, DOCK, LIGHTS, TAP, WIFI


def refs(client, headers, **params):
    r = client.get("/incidents", headers=headers, params=params)
    assert r.status_code == 200, r.text
    return {i["id"] for i in r.json()["items"]}


# ---------------------------------------------------------------- list / visibility

@pytest.mark.parametrize("who, expected", [
    ("alice", {CHAIR, LIGHTS, BADGE, AC, TAP, DOCK, WIFI}),  # admin: everything
    ("emma", {CHAIR, AC}),                                  # employee: own reports
    ("sofia", {DOCK, WIFI}),
    ("ethan", {LIGHTS, AC}),                                # engineer: assigned to them
    ("omar", set()),
])
def test_each_role_sees_only_its_incidents(client, as_, who, expected):
    assert refs(client, as_(who)) == expected


@pytest.mark.parametrize("params, expected", [
    ({"status": "open"}, {WIFI}),
    ({"status": ["resolved", "closed"]}, {LIGHTS, CHAIR}),
    ({"priority": "high"}, {WIFI}),
    ({"escalated": True}, {WIFI}),
    ({"unassigned": True}, {BADGE, WIFI}),
    ({"q": "INC-000004"}, {AC}),
    ({"q": "tap"}, {TAP}),
    ({"q": "nothing matches"}, set()),
])
def test_filters_and_search(client, as_, params, expected):
    assert refs(client, as_("alice"), **params) == expected


def test_pagination_reports_total(client, as_):
    body = client.get("/incidents", headers=as_("alice"), params={"limit": 2, "offset": 2}).json()
    assert body["total"] == 7 and len(body["items"]) == 2


def test_invalid_filter_is_rejected(client, as_):
    r = client.get("/incidents", headers=as_("alice"), params={"status": "lost"})
    assert r.status_code == 422 and "message" in r.json()


# ---------------------------------------------------------------- read

def test_detail_includes_notes_history_and_permissions(client, as_):
    d = client.get(f"/incidents/{AC}", headers=as_("emma")).json()
    assert d["reference"] == "INC-000004" and d["assigned_engineer"] == "Ethan Electrics"
    assert len(d["notes"]) == 3
    assert [(h["event_type"], h["to_value"]) for h in d["history"]] == [
        ("created", "open"),
        ("status_change", "assigned"),
        ("assignment", "Ethan Electrics"),  # engineer id shown as a name
        ("status_change", "in_progress"),
    ]
    assert d["permissions"]["can_add_note"] and not d["permissions"]["can_edit"]


def test_internal_notes_hidden_from_employees(client, as_):
    reporter = client.get(f"/incidents/{TAP}", headers=as_("liam")).json()
    engineer = client.get(f"/incidents/{TAP}", headers=as_("priya")).json()
    assert not any(n["is_internal"] for n in reporter["notes"])
    assert any(n["is_internal"] for n in engineer["notes"])


@pytest.mark.parametrize("who", ["liam", "tom"])
def test_cannot_read_someone_elses_incident(client, as_, who):
    r = client.get(f"/incidents/{AC}", headers=as_(who))
    assert r.status_code == 404 and r.json() == {"message": "Incident not found."}


def test_missing_incident_is_404(client, as_):
    assert client.get("/incidents/9999", headers=as_("alice")).status_code == 404


# ---------------------------------------------------------------- create

def test_create_incident(client, as_, new_incident):
    inc = new_incident()
    assert inc["reference"] == "INC-000008"
    assert inc["status"] == "open" and inc["priority"] == "medium"
    assert inc["reported_by"] == "Emma Employee" and inc["seat"]
    assert [h["event_type"] for h in inc["history"]] == ["created"]
    assert inc["id"] in refs(client, as_("emma"))
    # persisted: a fresh read returns the same data
    again = client.get(f"/incidents/{inc['id']}", headers=as_("emma")).json()
    assert again["title"] == inc["title"] and again["description"] == inc["description"]


def test_only_admin_can_report_critical(client, as_, new_incident):
    r = client.post("/incidents", headers=as_("emma"), json={
        "title": "Fire alarm", "description": "Sounding", "category": "security",
        "building_id": 1, "priority": "critical"})
    assert r.status_code == 400 and "escalation" in r.json()["message"]
    assert new_incident(reporter="alice", priority="critical")["priority"] == "critical"


def test_create_validates_location(client, as_, facilities):
    hq, inn = facilities["hq"], facilities["inn"]
    floor = facilities["hq_floor1"]
    base = {"title": "Leak", "description": "Drip", "category": "plumbing"}

    def post(**loc):
        return client.post("/incidents", headers=as_("emma"), json={**base, **loc})

    assert post(building_id=9999).json()["message"].startswith("That building doesn't exist")
    assert post(building_id=inn["id"], floor_id=floor["id"]).json()["message"] == "That floor is not in the selected building."
    other_floor_seat = facilities["hq_floor2"]["seats"][0]["id"]
    assert post(building_id=hq["id"], floor_id=floor["id"], seat_id=other_floor_seat).status_code == 400
    assert post(building_id=hq["id"], seat_id=floor["seats"][0]["id"]).json()["message"] == "Choose a floor when choosing a seat."


def test_create_rejects_inactive_building(client, as_, facilities):
    client.patch(f"/buildings/{facilities['inn']['id']}", headers=as_("alice"), json={"is_active": False})
    r = client.post("/incidents", headers=as_("emma"), json={
        "title": "Leak", "description": "Drip", "category": "plumbing", "building_id": facilities["inn"]["id"]})
    assert r.status_code == 400 and "no longer in use" in r.json()["message"]


def test_create_validation_errors(client, as_):
    r = client.post("/incidents", headers=as_("emma"), json={"title": "  ", "description": "x",
                                                            "category": "plumbing", "building_id": 1})
    assert r.status_code == 422 and r.json()["message"] == "This field is required."
    r = client.post("/incidents", headers=as_("emma"), content=b"{not json", )
    assert r.status_code == 422


# ---------------------------------------------------------------- update

def test_reporter_edits_while_open(client, as_, new_incident):
    inc = new_incident()
    r = client.patch(f"/incidents/{inc['id']}", headers=as_("emma"), json={"title": "Projector dead", "location_details": "Room 1A"})
    assert r.status_code == 200 and r.json()["title"] == "Projector dead"
    assert client.get(f"/incidents/{inc['id']}", headers=as_("emma")).json()["location_details"] == "Room 1A"


def test_reporter_cannot_edit_after_assignment(client, as_):
    r = client.patch(f"/incidents/{AC}", headers=as_("emma"), json={"title": "x"})
    assert r.status_code == 403 and r.json()["message"] == "This incident can no longer be edited."


def test_non_admin_cannot_set_priority(client, as_, new_incident):
    inc = new_incident()
    r = client.patch(f"/incidents/{inc['id']}", headers=as_("emma"), json={"priority": "high"})
    assert r.status_code == 403 and "priority" in r.json()["message"]


def test_engineer_cannot_edit_details(client, as_):
    assert client.patch(f"/incidents/{AC}", headers=as_("ethan"), json={"title": "x"}).status_code == 403


def test_admin_changes_priority_and_history_records_it(client, as_):
    r = client.patch(f"/incidents/{TAP}", headers=as_("alice"), json={"priority": "high"})
    assert r.status_code == 200 and r.json()["priority"] == "high"
    last = r.json()["history"][-1]
    assert (last["event_type"], last["from_value"], last["to_value"], last["changed_by"]) == \
        ("priority_change", "medium", "high", "Alice Admin")


def test_update_guards(client, as_, facilities):
    alice = as_("alice")
    assert client.patch(f"/incidents/{TAP}", headers=alice, json={"title": None}).status_code == 400
    assert client.patch(f"/incidents/{WIFI}", headers=alice, json={"is_escalated": True}).status_code == 400
    assert client.patch(f"/incidents/{CHAIR}", headers=alice, json={"title": "x"}).status_code == 403  # closed
    r = client.patch(f"/incidents/{TAP}", headers=alice, json={"floor_id": facilities["inn_floor1"]["id"]})
    assert r.status_code == 400 and "floor" in r.json()["message"]


# ---------------------------------------------------------------- delete

def test_admin_deletes_incident_with_notes(client, as_, seed_conn):
    assert client.delete(f"/incidents/{AC}", headers=as_("alice")).status_code == 204
    assert client.get(f"/incidents/{AC}", headers=as_("alice")).status_code == 404
    left = seed_conn.execute("SELECT count(*) FROM incident_notes WHERE incident_id = %s", (AC,)).fetchone()[0]
    assert left == 0


@pytest.mark.parametrize("who", ["emma", "ethan"])
def test_only_admin_deletes(client, as_, who):
    r = client.delete(f"/incidents/{AC}", headers=as_(who))
    assert r.status_code == 403 and r.json() == {"message": "You don't have permission to do that."}
    assert client.get(f"/incidents/{AC}", headers=as_("alice")).status_code == 200


def test_delete_missing_is_404(client, as_):
    assert client.delete("/incidents/9999", headers=as_("alice")).status_code == 404
