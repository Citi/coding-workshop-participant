"""
Unit tests for the projects service.

The service layer is monkeypatched, so these cover RBAC, validation and the
response contract without a database.

    cd backend/projects && python -m pytest test_projects.py -v
"""

import json
from datetime import date

import pytest

import models
import routes
import service
from _shared import auth as shared_auth
from _shared.validation import ValidationError, validate

PROJECT_ID = "22222222-2222-2222-2222-222222222222"
OWNER_ID = "11111111-1111-1111-1111-111111111111"

ROW = {
    "id": PROJECT_ID,
    "name": "Atlas Migration",
    "description": "Move billing onto the new platform",
    "department": "Engineering",
    "status": "active",
    "start_date": date(2026, 1, 5),
    "end_date": date(2026, 9, 30),
    "planned_budget": 250000,
    "owner_id": OWNER_ID,
    "owner_name": "Ada Sanders",
    "budget_consumed": 90000,
    "avg_completion": 42.5,
    "deliverable_count": 8,
    "overdue_count": 1,
    "at_risk": False,
}


def token_for(role):
    return shared_auth.create_access_token(
        {"id": OWNER_ID, "email": f"{role.lower()}@acme.test", "role": role}
    )


def make_event(method="GET", path="/projects", body=None, role="PROJECT_MANAGER", query=None):
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "headers": {"authorization": f"Bearer {token_for(role)}"},
        "queryStringParameters": query,
    }
    if body is not None:
        event["body"] = json.dumps(body)
    return event


def body_of(response):
    return json.loads(response["body"])


# --------------------------------------------------------------------------
# Serialisation
# --------------------------------------------------------------------------


def test_serialise_maps_snake_case_to_camel_case():
    result = models.serialise_project(ROW)

    assert result["startDate"] == date(2026, 1, 5)
    assert result["plannedBudget"] == 250000
    assert result["budgetConsumed"] == 90000
    assert result["ownerName"] == "Ada Sanders"


def test_serialise_defaults_missing_health_columns():
    """A plain projects row has no view columns joined in."""
    bare = {k: v for k, v in ROW.items() if k not in ("budget_consumed", "at_risk", "deliverable_count")}
    result = models.serialise_project(bare)

    assert result["budgetConsumed"] == 0
    assert result["atRisk"] is False
    assert result["deliverableCount"] == 0


def test_serialise_handles_null_owner():
    result = models.serialise_project({**ROW, "owner_id": None})
    assert result["ownerId"] is None


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------


def test_create_spec_accepts_a_valid_project():
    clean = validate(
        {
            "name": "Atlas Migration",
            "status": "active",
            "startDate": "2026-01-05",
            "plannedBudget": "250000.50",
            "ownerId": OWNER_ID,
        },
        models.CREATE_SPEC,
    )
    assert clean["startDate"] == date(2026, 1, 5)
    assert str(clean["plannedBudget"]) == "250000.50"


def test_create_spec_requires_a_name():
    with pytest.raises(ValidationError) as exc:
        validate({"status": "active"}, models.CREATE_SPEC)
    assert "name" in exc.value.field_errors


def test_create_spec_rejects_unknown_status():
    with pytest.raises(ValidationError) as exc:
        validate({"name": "Valid name", "status": "nearly_done"}, models.CREATE_SPEC)
    assert "status" in exc.value.field_errors


def test_create_spec_rejects_negative_budget():
    with pytest.raises(ValidationError) as exc:
        validate({"name": "Valid name", "plannedBudget": -5}, models.CREATE_SPEC)
    assert "plannedBudget" in exc.value.field_errors


def test_create_spec_rejects_malformed_date():
    with pytest.raises(ValidationError) as exc:
        validate({"name": "Valid name", "startDate": "05/01/2026"}, models.CREATE_SPEC)
    assert "startDate" in exc.value.field_errors


def test_date_order_rejects_end_before_start():
    errors = models.check_date_order({"startDate": date(2026, 6, 1), "endDate": date(2026, 1, 1)})
    assert "endDate" in errors


def test_date_order_uses_stored_value_on_partial_update():
    """Moving only the start date past the stored end date must be caught."""
    errors = models.check_date_order({"startDate": date(2026, 12, 1)}, ROW)
    assert "endDate" in errors


def test_date_order_allows_open_ended_project():
    assert models.check_date_order({"startDate": date(2026, 1, 1)}) == {}


# --------------------------------------------------------------------------
# RBAC
# --------------------------------------------------------------------------


def test_stakeholder_can_read(monkeypatch):
    monkeypatch.setattr(service, "list_projects", lambda **kwargs: [ROW])

    result = routes.list_projects(make_event(role="STAKEHOLDER"))
    assert result["statusCode"] == 200


def test_stakeholder_cannot_create():
    with pytest.raises(shared_auth.AuthError) as exc:
        routes.create_project(make_event("POST", body={"name": "Nope"}, role="STAKEHOLDER"))
    assert exc.value.status == 403


def test_employee_cannot_delete():
    with pytest.raises(shared_auth.AuthError) as exc:
        routes.delete_project(make_event("DELETE", role="EMPLOYEE"), id=PROJECT_ID)
    assert exc.value.status == 403


def test_project_manager_can_delete(monkeypatch):
    monkeypatch.setattr(service, "delete_project", lambda pid: {"id": pid})

    result = routes.delete_project(make_event("DELETE", role="PROJECT_MANAGER"), id=PROJECT_ID)
    assert result["statusCode"] == 204
    assert "body" not in result


def test_unauthenticated_request_is_rejected():
    event = {"rawPath": "/projects", "requestContext": {"http": {"method": "GET"}}, "headers": {}}
    with pytest.raises(shared_auth.AuthError) as exc:
        routes.list_projects(event)
    assert exc.value.status == 401


def test_permission_is_checked_before_validation():
    """A Stakeholder posting garbage gets 403, not a field-by-field 400."""
    with pytest.raises(shared_auth.AuthError):
        routes.create_project(make_event("POST", body={"nonsense": True}, role="STAKEHOLDER"))


# --------------------------------------------------------------------------
# Create
# --------------------------------------------------------------------------


def test_create_returns_201(monkeypatch):
    monkeypatch.setattr(service, "owner_exists", lambda oid: True)
    monkeypatch.setattr(service, "create_project", lambda data: ROW)

    result = routes.create_project(
        make_event("POST", body={"name": "Atlas Migration", "status": "active"})
    )

    assert result["statusCode"] == 201
    assert body_of(result)["name"] == "Atlas Migration"


def test_create_rejects_unknown_owner(monkeypatch):
    monkeypatch.setattr(service, "owner_exists", lambda oid: False)

    with pytest.raises(ValidationError) as exc:
        routes.create_project(make_event("POST", body={"name": "Atlas Migration", "ownerId": OWNER_ID}))
    assert "ownerId" in exc.value.field_errors


def test_create_rejects_reversed_dates(monkeypatch):
    monkeypatch.setattr(service, "owner_exists", lambda oid: True)

    with pytest.raises(ValidationError) as exc:
        routes.create_project(
            make_event("POST", body={"name": "Atlas", "startDate": "2026-09-01", "endDate": "2026-01-01"})
        )
    assert "endDate" in exc.value.field_errors


# --------------------------------------------------------------------------
# Read / update / delete
# --------------------------------------------------------------------------


def test_get_returns_404_for_missing_project(monkeypatch):
    monkeypatch.setattr(service, "get_project", lambda pid: None)

    result = routes.get_project(make_event(), id=PROJECT_ID)
    assert result["statusCode"] == 404


def test_update_returns_404_before_validating(monkeypatch):
    monkeypatch.setattr(service, "get_project", lambda pid: None)

    result = routes.update_project(make_event("PUT", body={"name": "x"}), id=PROJECT_ID)
    assert result["statusCode"] == 404


def test_update_applies_only_supplied_fields(monkeypatch):
    captured = {}
    monkeypatch.setattr(service, "get_project", lambda pid: ROW)
    monkeypatch.setattr(
        service,
        "update_project",
        lambda pid, data: captured.update(data) or {**ROW, **{"status": data.get("status", ROW["status"])}},
    )

    routes.update_project(make_event("PUT", body={"status": "on_hold"}), id=PROJECT_ID)

    assert captured == {"status": "on_hold"}


def test_delete_returns_404_for_missing_project(monkeypatch):
    monkeypatch.setattr(service, "delete_project", lambda pid: None)

    result = routes.delete_project(make_event("DELETE"), id=PROJECT_ID)
    assert result["statusCode"] == 404


# --------------------------------------------------------------------------
# List filters
# --------------------------------------------------------------------------


def test_list_passes_filters_through(monkeypatch):
    captured = {}
    monkeypatch.setattr(service, "list_projects", lambda **kwargs: captured.update(kwargs) or [])

    routes.list_projects(
        make_event(query={"search": "atlas", "status": "active", "atRisk": "true", "department": "Engineering"})
    )

    assert captured["search"] == "atlas"
    assert captured["status"] == "active"
    assert captured["at_risk"] is True
    assert captured["department"] == "Engineering"


def test_list_rejects_invalid_status_filter():
    with pytest.raises(ValidationError) as exc:
        routes.list_projects(make_event(query={"status": "almost_done"}))
    assert "status" in exc.value.field_errors


def test_list_handles_absent_query_string(monkeypatch):
    """Lambda sends queryStringParameters: null when there is no query."""
    monkeypatch.setattr(service, "list_projects", lambda **kwargs: [ROW])

    result = routes.list_projects(make_event(query=None))
    assert result["statusCode"] == 200
