"""Incident lifecycle: assignment, status changes, escalation and notes."""

import pytest

from tests.integration.conftest import AC, BADGE, CHAIR, DOCK, LIGHTS, TAP, USERS, WIFI


def status(client, headers, incident_id, new, **extra):
    return client.post(f"/incidents/{incident_id}/status", headers=headers, json={"status": new, **extra})


def assign(client, headers, incident_id, engineer):
    return client.post(f"/incidents/{incident_id}/assign", headers=headers, json={"engineer_id": USERS[engineer][0]})


# ---------------------------------------------------------------- full journey

def test_full_lifecycle_from_report_to_closure(client, as_, new_incident):
    """Employee reports -> admin assigns -> engineer works it -> employee confirms."""
    emma, alice, tom = as_("emma"), as_("alice"), as_("tom")
    inc = new_incident()
    iid = inc["id"]
    assert inc["permissions"]["status_transitions"] == ["cancelled"]

    d = assign(client, alice, iid, "tom").json()
    assert d["status"] == "assigned" and d["assigned_engineer"] == "Tom Tech"

    d = status(client, tom, iid, "in_progress", comment="On my way").json()
    assert d["status"] == "in_progress" and d["notes"][-1]["body"] == "On my way"
    assert status(client, tom, iid, "on_hold").json()["status"] == "on_hold"
    assert status(client, tom, iid, "in_progress").status_code == 200

    d = status(client, tom, iid, "resolved").json()
    assert d["status"] == "resolved" and d["resolved_at"]

    d = client.get(f"/incidents/{iid}", headers=emma).json()
    assert d["permissions"]["status_transitions"] == ["in_progress", "closed"]
    d = status(client, emma, iid, "closed").json()
    assert d["status"] == "closed" and d["closed_at"]
    assert d["permissions"]["can_add_note"] is False

    events = [(h["event_type"], h["to_value"]) for h in d["history"] if h["event_type"] == "status_change"]
    assert [to for _, to in events] == ["assigned", "in_progress", "on_hold", "in_progress", "resolved", "closed"]


def test_reporter_reopens_resolved_incident(client, as_):
    d = status(client, as_("noah"), LIGHTS, "in_progress").json()
    assert d["status"] == "in_progress" and d["resolved_at"] is None


# ---------------------------------------------------------------- status rules

@pytest.mark.parametrize("who, incident_id, new, code", [
    ("tom", DOCK, "resolved", 403),        # engineer can't skip in_progress
    ("ethan", DOCK, "in_progress", 404),   # not their ticket - not even visible
    ("emma", AC, "cancelled", 403),        # work started - too late to cancel
    ("emma", AC, "resolved", 403),         # reporter can't resolve
    ("liam", AC, "closed", 404),           # stranger
    ("alice", WIFI, "in_progress", 403),   # nobody assigned yet
    ("alice", CHAIR, "closed", 403),       # already closed
])
def test_forbidden_transitions(client, as_, who, incident_id, new, code):
    r = status(client, as_(who), incident_id, new)
    assert r.status_code == code
    assert "message" in r.json()


def test_reporter_cancels_before_work_starts(client, as_):
    assert status(client, as_("sofia"), DOCK, "cancelled").json()["status"] == "cancelled"


def test_admin_can_override_status(client, as_):
    assert status(client, as_("alice"), AC, "resolved").json()["status"] == "resolved"
    assert status(client, as_("alice"), BADGE, "open").json()["status"] == "open"


def test_unknown_status_is_validation_error(client, as_):
    assert status(client, as_("alice"), AC, "done").status_code == 422


# ---------------------------------------------------------------- assignment

def test_reassign_records_history(client, as_):
    d = assign(client, as_("alice"), DOCK, "ethan").json()
    assert d["assigned_engineer"] == "Ethan Electrics" and d["status"] == "assigned"
    last = d["history"][-1]
    assert (last["event_type"], last["from_value"], last["to_value"]) == ("assignment", "Tom Tech", "Ethan Electrics")


def test_busy_engineer_can_still_be_assigned(client, as_):
    assert assign(client, as_("alice"), WIFI, "priya").status_code == 200


@pytest.mark.parametrize("engineer_id, message", [
    (USERS["omar"][0], "Omar Hassan is on leave and can't take new tickets."),
    (USERS["emma"][0], "That engineer doesn't exist or is inactive."),
    (9999, "That engineer doesn't exist or is inactive."),
])
def test_assign_rejects_unavailable_or_invalid(client, as_, engineer_id, message):
    r = client.post(f"/incidents/{WIFI}/assign", headers=as_("alice"), json={"engineer_id": engineer_id})
    assert r.status_code == 400 and r.json()["message"] == message


def test_cannot_assign_closed_incident(client, as_):
    assert assign(client, as_("alice"), CHAIR, "priya").status_code == 400


@pytest.mark.parametrize("who", ["emma", "tom"])
def test_only_admin_assigns(client, as_, who):
    assert assign(client, as_(who), WIFI, "tom").status_code == 403


# ---------------------------------------------------------------- escalation

def test_reporter_escalates_and_requests_priority(client, as_):
    r = client.post(f"/incidents/{AC}/escalate", headers=as_("emma"),
                    json={"reason": "Finance close this week", "requested_priority": "high"})
    assert r.status_code == 200
    d = r.json()
    assert d["is_escalated"] and d["requested_priority"] == "high" and d["escalation_reason"] == "Finance close this week"
    assert {"escalation", "priority_request"} <= {h["event_type"] for h in d["history"]}
    assert d["permissions"]["can_escalate"] is False


def test_admin_approves_escalation(client, as_):
    r = client.patch(f"/incidents/{WIFI}", headers=as_("alice"), json={"priority": "critical", "is_escalated": False})
    d = r.json()
    assert r.status_code == 200 and d["priority"] == "critical" and not d["is_escalated"] and d["escalated_at"] is None


@pytest.mark.parametrize("who, incident_id, body, code", [
    ("emma", AC, {"reason": "x", "requested_priority": "low"}, 400),   # not higher
    ("sofia", WIFI, {"reason": "again"}, 403),                          # already escalated
    ("emma", CHAIR, {"reason": "x"}, 403),                              # closed
    ("ethan", AC, {"reason": "x"}, 403),                                # not the reporter
    ("emma", AC, {"reason": "  "}, 422),                                # reason required
])
def test_escalation_rules(client, as_, who, incident_id, body, code):
    assert client.post(f"/incidents/{incident_id}/escalate", headers=as_(who), json=body).status_code == code


# ---------------------------------------------------------------- notes

def test_notes_from_each_role(client, as_):
    for who, internal in [("emma", False), ("ethan", False), ("ethan", True), ("alice", True)]:
        r = client.post(f"/incidents/{AC}/notes", headers=as_(who), json={"body": f"note by {who}", "is_internal": internal})
        assert r.status_code == 201
    staff_view = client.get(f"/incidents/{AC}", headers=as_("ethan")).json()["notes"]
    reporter_view = client.get(f"/incidents/{AC}", headers=as_("emma")).json()["notes"]
    assert len(staff_view) == 7 and len(reporter_view) == 5
    assert reporter_view[-1]["author_role"] == "engineer"


def test_note_rules(client, as_):
    assert client.post(f"/incidents/{AC}/notes", headers=as_("emma"),
                       json={"body": "secret", "is_internal": True}).status_code == 403
    assert client.post(f"/incidents/{CHAIR}/notes", headers=as_("emma"), json={"body": "hi"}).status_code == 403
    assert client.post(f"/incidents/{AC}/notes", headers=as_("liam"), json={"body": "hi"}).status_code == 404
    assert client.post(f"/incidents/{TAP}/notes", headers=as_("liam"), json={"body": " "}).status_code == 422
