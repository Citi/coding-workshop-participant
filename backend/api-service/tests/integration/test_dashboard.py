"""Role-specific dashboards, checked against the known seed data."""


def test_employee_dashboard(client, as_):
    d = client.get("/dashboard", headers=as_("emma")).json()
    assert d["role"] == "employee"
    assert d["status_counts"] == {"in_progress": 1, "closed": 1}
    assert {i["reference"] for i in d["incidents"]} == {"INC-000001", "INC-000004"}


def test_engineer_dashboard_shows_open_work_and_capacity(client, as_):
    d = client.get("/dashboard", headers=as_("ethan")).json()
    assert d["role"] == "engineer"
    assert d["profile"]["availability"] == "available" and d["profile"]["remaining_capacity"] == 4
    # in-progress work first, resolved (awaiting the reporter) last
    assert [i["status"] for i in d["incidents"]] == ["in_progress", "resolved"]


def test_admin_dashboard_attention_counts(client, as_):
    d = client.get("/dashboard", headers=as_("alice")).json()
    assert d["role"] == "facility_admin"
    assert d["attention"] == {"unassigned": 1, "escalated": 1, "priority_requests": 1, "awaiting_closure": 1}
    assert d["facilities"] == {"buildings": 2, "floors": 5, "seats": 9}
    assert sum(d["status_counts"].values()) == 7
    assert d["needs_attention"][0]["reference"] == "INC-000007"  # escalated first
    assert len(d["engineers"]) == 4
