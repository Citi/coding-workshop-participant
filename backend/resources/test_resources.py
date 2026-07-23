"""
Unit tests for the resources service.

    cd backend/resources && python -m pytest test_resources.py -v
"""

import json
from datetime import date

import pytest

import models
import routes
import service
from _shared import auth as shared_auth
from _shared.validation import ValidationError, validate

RESOURCE_ID = "55555555-5555-5555-5555-555555555555"
PROJECT_ID = "22222222-2222-2222-2222-222222222222"
ALLOCATION_ID = "66666666-6666-6666-6666-666666666666"

RESOURCE = {
    "id": RESOURCE_ID,
    "full_name": "Ada Sanders",
    "email": "ada@acme.test",
    "role_title": "Backend Engineer",
    "capacity_pct": 100,
    "allocated_pct": 80,
    "project_count": 2,
    "is_over_allocated": False,
}

ALLOCATION = {
    "id": ALLOCATION_ID,
    "resource_id": RESOURCE_ID,
    "project_id": PROJECT_ID,
    "resource_name": "Ada Sanders",
    "project_name": "Atlas Migration",
    "allocation_pct": 50,
    "start_date": date(2026, 1, 1),
    "end_date": date(2026, 6, 30),
    "is_active": True,
}


def make_event(method="GET", path="/resources", body=None, role="PROJECT_MANAGER", query=None):
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "headers": {
            "authorization": "Bearer "
            + shared_auth.create_access_token(
                {"id": RESOURCE_ID, "email": "pm@acme.test", "role": role}
            )
        },
        "queryStringParameters": query,
    }
    if body is not None:
        event["body"] = json.dumps(body)
    return event


def body_of(response):
    return json.loads(response["body"])


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------


def test_create_requires_a_name():
    with pytest.raises(ValidationError) as exc:
        validate({}, models.CREATE_SPEC)
    assert "fullName" in exc.value.field_errors


def test_capacity_is_bounded_to_100():
    """Mirrors the CHECK on resources.capacity_pct."""
    with pytest.raises(ValidationError) as exc:
        validate({"fullName": "Ada", "capacityPct": 150}, models.CREATE_SPEC)
    assert "capacityPct" in exc.value.field_errors


def test_invalid_email_is_rejected():
    with pytest.raises(ValidationError) as exc:
        validate({"fullName": "Ada", "email": "not-an-email"}, models.CREATE_SPEC)
    assert "email" in exc.value.field_errors


def test_allocation_percent_must_be_between_1_and_100():
    base = {"resourceId": RESOURCE_ID, "projectId": PROJECT_ID, "startDate": "2026-01-01"}

    with pytest.raises(ValidationError):
        validate({**base, "allocationPct": 0}, models.ALLOCATION_SPEC)
    with pytest.raises(ValidationError):
        validate({**base, "allocationPct": 101}, models.ALLOCATION_SPEC)


def test_allocation_update_cannot_reassign_resource_or_project():
    """Changing either would rewrite two projects' utilization history."""
    clean = validate(
        {"resourceId": "x", "projectId": "y", "allocationPct": 30},
        models.ALLOCATION_UPDATE_SPEC,
        partial=True,
    )
    assert clean == {"allocationPct": 30}


def test_date_order_rejects_end_before_start():
    errors = models.check_date_order({"startDate": date(2026, 6, 1), "endDate": date(2026, 1, 1)})
    assert "endDate" in errors


def test_date_order_uses_stored_value_on_partial_update():
    errors = models.check_date_order({"startDate": date(2026, 12, 1)}, ALLOCATION)
    assert "endDate" in errors


def test_open_ended_allocation_is_valid():
    assert models.check_date_order({"startDate": date(2026, 1, 1)}) == {}


# --------------------------------------------------------------------------
# RBAC
# --------------------------------------------------------------------------


def test_stakeholder_can_read_utilization(monkeypatch):
    monkeypatch.setattr(service, "get_utilization", lambda: [RESOURCE])
    assert routes.get_utilization(make_event(role="STAKEHOLDER"))["statusCode"] == 200


def test_stakeholder_cannot_create_allocation():
    with pytest.raises(shared_auth.AuthError) as exc:
        routes.create_allocation(make_event("POST", body={}, role="STAKEHOLDER"))
    assert exc.value.status == 403


def test_employee_cannot_delete_resource():
    with pytest.raises(shared_auth.AuthError) as exc:
        routes.delete_resource(make_event("DELETE", role="EMPLOYEE"), id=RESOURCE_ID)
    assert exc.value.status == 403


# --------------------------------------------------------------------------
# Over-allocation — warn, do not block
# --------------------------------------------------------------------------


def test_allocation_over_capacity_warns_but_still_saves(monkeypatch):
    monkeypatch.setattr(service, "get_resource", lambda rid: RESOURCE)
    monkeypatch.setattr(service, "project_exists", lambda pid: True)
    monkeypatch.setattr(service, "committed_in_window", lambda *a, **k: 80)
    monkeypatch.setattr(service, "create_allocation", lambda data: ALLOCATION)

    result = routes.create_allocation(
        make_event("POST", body={
            "resourceId": RESOURCE_ID, "projectId": PROJECT_ID,
            "allocationPct": 50, "startDate": "2026-01-01",
        })
    )
    payload = body_of(result)

    # Saved...
    assert result["statusCode"] == 201
    # ...and flagged.
    assert payload["overAllocation"]["projectedTotal"] == 130
    assert payload["overAllocation"]["committedElsewhere"] == 80


def test_allocation_within_capacity_has_no_warning(monkeypatch):
    monkeypatch.setattr(service, "get_resource", lambda rid: RESOURCE)
    monkeypatch.setattr(service, "project_exists", lambda pid: True)
    monkeypatch.setattr(service, "committed_in_window", lambda *a, **k: 30)
    monkeypatch.setattr(service, "create_allocation", lambda data: ALLOCATION)

    payload = body_of(
        routes.create_allocation(
            make_event("POST", body={
                "resourceId": RESOURCE_ID, "projectId": PROJECT_ID,
                "allocationPct": 50, "startDate": "2026-01-01",
            })
        )
    )
    assert "overAllocation" not in payload


def test_allocation_respects_a_reduced_capacity(monkeypatch):
    """A part-time person is over-allocated below 100%."""
    part_time = {**RESOURCE, "capacity_pct": 50}
    monkeypatch.setattr(service, "get_resource", lambda rid: part_time)
    monkeypatch.setattr(service, "project_exists", lambda pid: True)
    monkeypatch.setattr(service, "committed_in_window", lambda *a, **k: 30)
    monkeypatch.setattr(service, "create_allocation", lambda data: ALLOCATION)

    payload = body_of(
        routes.create_allocation(
            make_event("POST", body={
                "resourceId": RESOURCE_ID, "projectId": PROJECT_ID,
                "allocationPct": 30, "startDate": "2026-01-01",
            })
        )
    )
    assert payload["overAllocation"]["projectedTotal"] == 60
    assert payload["overAllocation"]["capacityPct"] == 50


def test_allocation_rejects_unknown_resource(monkeypatch):
    monkeypatch.setattr(service, "get_resource", lambda rid: None)

    with pytest.raises(ValidationError) as exc:
        routes.create_allocation(
            make_event("POST", body={
                "resourceId": RESOURCE_ID, "projectId": PROJECT_ID,
                "allocationPct": 50, "startDate": "2026-01-01",
            })
        )
    assert "resourceId" in exc.value.field_errors


def test_allocation_rejects_unknown_project(monkeypatch):
    monkeypatch.setattr(service, "get_resource", lambda rid: RESOURCE)
    monkeypatch.setattr(service, "project_exists", lambda pid: False)

    with pytest.raises(ValidationError) as exc:
        routes.create_allocation(
            make_event("POST", body={
                "resourceId": RESOURCE_ID, "projectId": PROJECT_ID,
                "allocationPct": 50, "startDate": "2026-01-01",
            })
        )
    assert "projectId" in exc.value.field_errors


# --------------------------------------------------------------------------
# Serialisation
# --------------------------------------------------------------------------


def test_serialise_resource_includes_utilization():
    result = models.serialise_resource(RESOURCE)
    assert result["allocatedPct"] == 80
    assert result["projectCount"] == 2
    assert result["isOverAllocated"] is False


def test_serialise_resource_defaults_when_view_not_joined():
    bare = {k: v for k, v in RESOURCE.items()
            if k not in ("allocated_pct", "project_count", "is_over_allocated")}
    result = models.serialise_resource(bare)
    assert result["allocatedPct"] == 0
    assert result["isOverAllocated"] is False


def test_utilization_report_shape(monkeypatch):
    monkeypatch.setattr(service, "get_utilization", lambda: [RESOURCE])
    row = body_of(routes.get_utilization(make_event()))[0]

    assert row["fullName"] == "Ada Sanders"
    assert row["allocatedPct"] == 80
    assert row["capacityPct"] == 100


def test_get_resource_includes_their_projects(monkeypatch):
    monkeypatch.setattr(service, "get_resource", lambda rid: RESOURCE)
    monkeypatch.setattr(
        service,
        "get_resource_projects",
        lambda rid: [{
            "id": PROJECT_ID, "name": "Atlas Migration", "status": "active",
            "allocation_pct": 50, "start_date": date(2026, 1, 1), "end_date": None,
        }],
    )

    payload = body_of(routes.get_resource(make_event(), id=RESOURCE_ID))
    assert payload["projects"][0]["name"] == "Atlas Migration"


# --------------------------------------------------------------------------
# Not found
# --------------------------------------------------------------------------


def test_get_missing_resource_returns_404(monkeypatch):
    monkeypatch.setattr(service, "get_resource", lambda rid: None)
    assert routes.get_resource(make_event(), id=RESOURCE_ID)["statusCode"] == 404


def test_delete_missing_allocation_returns_404(monkeypatch):
    monkeypatch.setattr(service, "delete_allocation", lambda aid: None)
    assert routes.delete_allocation(make_event("DELETE"), id=ALLOCATION_ID)["statusCode"] == 404
