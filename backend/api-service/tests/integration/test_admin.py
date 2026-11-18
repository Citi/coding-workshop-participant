"""Facility Admin management: buildings / floors / seats and engineer profiles."""

import pytest

from tests.integration.conftest import PASSWORD, USERS


# ---------------------------------------------------------------- facilities

def test_everyone_reads_active_facilities(client, as_):
    tree = client.get("/facilities", headers=as_("emma")).json()
    assert [b["code"] for b in tree] == ["HQ1", "INN"]
    assert sum(len(f["seats"]) for b in tree for f in b["floors"]) == 9


def test_inactive_items_hidden_except_for_admin(client, as_, facilities):
    alice = as_("alice")
    seat = facilities["hq_floor1"]["seats"][0]
    client.patch(f"/seats/{seat['id']}", headers=alice, json={"is_active": False})
    client.patch(f"/buildings/{facilities['inn']['id']}", headers=alice, json={"is_active": False})

    employee = client.get("/facilities", headers=as_("emma"), params={"include_inactive": True}).json()
    assert [b["code"] for b in employee] == ["HQ1"]
    seats = [s["id"] for b in employee for f in b["floors"] for s in f["seats"]]
    assert seat["id"] not in seats

    admin = client.get("/facilities", headers=alice, params={"include_inactive": True}).json()
    assert len(admin) == 2


def test_create_building_floor_and_seat(client, as_):
    alice = as_("alice")
    b = client.post("/buildings", headers=alice, json={"code": "lon", "name": "London Office", "city": "London", "address": " "})
    assert b.status_code == 201
    b = b.json()
    assert b["code"] == "LON" and b["address"] is None and b["floors"] == []

    f = client.post("/floors", headers=alice, json={"building_id": b["id"], "floor_number": 3, "name": "Sales"})
    assert f.status_code == 201 and f.json()["seats"] == []
    s = client.post("/seats", headers=alice, json={"floor_id": f.json()["id"], "seat_code": "3-001"})
    assert s.status_code == 201 and s.json()["is_active"] is True

    tree = client.get("/facilities", headers=as_("emma")).json()
    london = next(x for x in tree if x["code"] == "LON")
    assert london["floors"][0]["seats"][0]["seat_code"] == "3-001"


@pytest.mark.parametrize("path, body, message", [
    ("/buildings", {"code": "HQ1", "name": "Another"}, "already exists"),
    ("/floors", {"building_id": 1, "floor_number": 1}, "already exists"),
])
def test_duplicates_are_conflicts(client, as_, path, body, message):
    r = client.post(path, headers=as_("alice"), json=body)
    assert r.status_code == 409 and message in r.json()["message"]


def test_duplicate_seat_code_on_floor(client, as_, facilities):
    floor = facilities["hq_floor1"]
    r = client.post("/seats", headers=as_("alice"), json={"floor_id": floor["id"], "seat_code": floor["seats"][0]["seat_code"]})
    assert r.status_code == 409


def test_update_facilities(client, as_, facilities):
    alice = as_("alice")
    r = client.patch(f"/buildings/{facilities['hq']['id']}", headers=alice, json={"name": "HQ Renamed", "city": None})
    assert r.status_code == 200 and r.json()["name"] == "HQ Renamed" and r.json()["city"] is None
    floor = facilities["hq_floor2"]
    assert client.patch(f"/floors/{floor['id']}", headers=alice, json={"name": "Marketing & Sales"}).json()["name"] == "Marketing & Sales"
    seat = floor["seats"][0]
    assert client.patch(f"/seats/{seat['id']}", headers=alice, json={"description": "Window"}).json()["description"] == "Window"
    # required values can't be cleared
    assert client.patch(f"/buildings/{facilities['hq']['id']}", headers=alice, json={"name": None}).status_code == 400
    assert client.patch(f"/floors/{floor['id']}", headers=alice, json={"floor_number": None}).status_code == 400
    assert client.patch(f"/seats/{seat['id']}", headers=alice, json={"is_active": None}).status_code == 400


def test_delete_unused_items(client, as_):
    alice = as_("alice")
    b = client.post("/buildings", headers=alice, json={"code": "TMP", "name": "Temp"}).json()
    f = client.post("/floors", headers=alice, json={"building_id": b["id"], "floor_number": 0}).json()
    s = client.post("/seats", headers=alice, json={"floor_id": f["id"], "seat_code": "T1"}).json()
    assert client.delete(f"/seats/{s['id']}", headers=alice).status_code == 204
    assert client.delete(f"/floors/{f['id']}", headers=alice).status_code == 204
    assert client.delete(f"/buildings/{b['id']}", headers=alice).status_code == 204
    assert client.delete(f"/buildings/{b['id']}", headers=alice).status_code == 404


def test_cannot_delete_items_used_by_incidents(client, as_, facilities):
    alice = as_("alice")
    floor = facilities["hq_floor1"]
    for path in (f"/buildings/{facilities['hq']['id']}", f"/floors/{floor['id']}", f"/seats/{floor['seats'][0]['id']}"):
        r = client.delete(path, headers=alice)
        assert r.status_code == 409 and "Deactivate it instead" in r.json()["message"]


@pytest.mark.parametrize("method, path, body", [
    ("post", "/buildings", {"code": "X", "name": "X"}),
    ("patch", "/buildings/1", {"name": "X"}),
    ("delete", "/buildings/1", None),
    ("post", "/floors", {"building_id": 1, "floor_number": 9}),
    ("post", "/seats", {"floor_id": 1, "seat_code": "X"}),
    ("get", "/engineers", None),
    ("post", "/engineers", {"name": "X", "email": "x@acme.inc", "password": PASSWORD}),
    ("patch", "/engineers/2", {"name": "X"}),
])
@pytest.mark.parametrize("who", ["emma", "ethan"])
def test_admin_endpoints_reject_other_roles(client, as_, who, method, path, body):
    kwargs = {"json": body} if body is not None else {}
    r = getattr(client, method)(path, headers=as_(who), **kwargs)
    assert r.status_code == 403 and r.json() == {"message": "You don't have permission to do that."}


def test_missing_parents_are_404(client, as_):
    alice = as_("alice")
    assert client.post("/floors", headers=alice, json={"building_id": 999, "floor_number": 1}).status_code == 404
    assert client.post("/seats", headers=alice, json={"floor_id": 999, "seat_code": "X"}).status_code == 404
    assert client.patch("/seats/999", headers=alice, json={"description": "x"}).status_code == 404


# ---------------------------------------------------------------- engineers

def test_list_engineers_with_workload(client, as_):
    engineers = {e["email"]: e for e in client.get("/engineers", headers=as_("alice")).json()}
    assert set(engineers) == {"ethan.eng@acme.inc", "priya.eng@acme.inc", "tom.eng@acme.inc", "omar.eng@acme.inc"}
    ethan = engineers["ethan.eng@acme.inc"]
    assert ethan["active_tickets"] == 1 and ethan["remaining_capacity"] == 4  # AC in progress; lights resolved
    assert set(ethan["specializations"]) == {"electrical", "hvac"}


def test_create_engineer_who_can_then_log_in(client, as_, facilities):
    r = client.post("/engineers", headers=as_("alice"), json={
        "name": "Grace Hopper", "email": "Grace.Eng@acme.inc", "password": PASSWORD,
        "specializations": ["network", "network", "it_hardware"], "max_active_tickets": 3,
        "home_building_id": facilities["inn"]["id"], "phone": " ",
    })
    assert r.status_code == 201, r.text
    g = r.json()
    assert g["email"] == "grace.eng@acme.inc" and g["specializations"] == ["network", "it_hardware"]
    assert g["home_building"] == "ACME Innovation Hub" and g["phone"] is None and g["active_tickets"] == 0

    login = client.post("/auth/login", json={"email": "grace.eng@acme.inc", "password": PASSWORD}).json()
    assert login["user"]["role"] == "engineer"
    assert client.get(f"/engineers/{g['id']}", headers=as_("alice")).json()["name"] == "Grace Hopper"


def test_create_engineer_errors(client, as_):
    alice = as_("alice")
    base = {"name": "Dup", "password": PASSWORD}
    assert client.post("/engineers", headers=alice, json={**base, "email": "tom.eng@acme.inc"}).status_code == 409
    assert client.post("/engineers", headers=alice, json={**base, "email": "x@acme.inc", "home_building_id": 999}).status_code == 400
    assert client.post("/engineers", headers=alice, json={**base, "email": "x@gmail.com"}).status_code == 422


def test_update_engineer_profile(client, as_):
    r = client.patch(f"/engineers/{USERS['tom'][0]}", headers=as_("alice"),
                     json={"availability": "busy", "max_active_tickets": 2, "department": "IT", "specializations": ["network"]})
    t = r.json()
    assert r.status_code == 200 and t["availability"] == "busy" and t["max_active_tickets"] == 2
    assert t["department"] == "IT" and t["specializations"] == ["network"]


def test_update_engineer_errors(client, as_):
    alice = as_("alice")
    assert client.patch("/engineers/999", headers=alice, json={"name": "X"}).status_code == 404
    assert client.get("/engineers/999", headers=alice).status_code == 404
    assert client.patch("/engineers/2", headers=alice, json={"name": None}).status_code == 400
    assert client.patch("/engineers/2", headers=alice, json={"home_building_id": 999}).status_code == 400


def test_deactivating_engineer_requires_no_active_tickets(client, as_):
    alice = as_("alice")
    r = client.patch(f"/engineers/{USERS['ethan'][0]}", headers=alice, json={"is_active": False})
    assert r.status_code == 409 and "Reassign them first" in r.json()["message"]

    r = client.patch(f"/engineers/{USERS['omar'][0]}", headers=alice, json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    emails = [e["email"] for e in client.get("/engineers", headers=alice).json()]
    assert "omar.eng@acme.inc" not in emails
    assert len(client.get("/engineers", headers=alice, params={"include_inactive": True}).json()) == 4
    login = client.post("/auth/login", json={"email": "omar.eng@acme.inc", "password": PASSWORD})
    assert login.status_code == 403


def test_engineer_sets_own_availability(client, as_):
    r = client.patch("/engineers/me/availability", headers=as_("ethan"), json={"availability": "on_leave"})
    assert r.status_code == 200 and r.json()["availability"] == "on_leave"
    # ...and can no longer be assigned new work
    r = client.post("/incidents/7/assign", headers=as_("alice"), json={"engineer_id": USERS["ethan"][0]})
    assert r.status_code == 400


def test_availability_is_engineers_only(client, as_):
    r = client.patch("/engineers/me/availability", headers=as_("emma"), json={"availability": "busy"})
    assert r.status_code == 403
    assert client.patch("/engineers/me/availability", headers=as_("tom"), json={"availability": "sleeping"}).status_code == 422
