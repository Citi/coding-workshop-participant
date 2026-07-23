"""
Unit tests for the deliverables service.

    cd backend/deliverables && python -m pytest test_deliverables.py -v
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
OTHER_PROJECT_ID = "99999999-9999-9999-9999-999999999999"
DELIVERABLE_ID = "33333333-3333-3333-3333-333333333333"
OTHER_ID = "44444444-4444-4444-4444-444444444444"

ROW = {
    "id": DELIVERABLE_ID,
    "project_id": PROJECT_ID,
    "project_name": "Atlas Migration",
    "name": "Design schema",
    "description": None,
    "status": "in_progress",
    "completion_percentage": 40,
    "due_date": date(2026, 3, 1),
    "assignee_id": None,
    "assignee_name": None,
    "depends_on": [],
    "is_overdue": False,
}


def make_event(method="GET", path="/deliverables", body=None, role="PROJECT_MANAGER", query=None):
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "headers": {
            "authorization": "Bearer "
            + shared_auth.create_access_token(
                {"id": PROJECT_ID, "email": "pm@acme.test", "role": role}
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
# Status / completion reconciliation
# --------------------------------------------------------------------------


def test_completed_status_forces_full_completion():
    assert models.reconcile_completion({"status": "completed"})["completionPercentage"] == 100


def test_full_completion_implies_completed_status():
    assert models.reconcile_completion({"completionPercentage": 100})["status"] == "completed"


def test_explicit_completion_alongside_completed_is_respected():
    """A caller recording a partially-delivered item is not overridden."""
    result = models.reconcile_completion({"status": "completed", "completionPercentage": 80})
    assert result["completionPercentage"] == 80


def test_reconcile_leaves_ordinary_updates_alone():
    result = models.reconcile_completion({"status": "in_progress", "completionPercentage": 40})
    assert result == {"status": "in_progress", "completionPercentage": 40}


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------


def test_create_requires_project_and_name():
    with pytest.raises(ValidationError) as exc:
        validate({}, models.CREATE_SPEC)
    assert "projectId" in exc.value.field_errors
    assert "name" in exc.value.field_errors


def test_completion_percentage_is_bounded():
    with pytest.raises(ValidationError) as exc:
        validate({"projectId": PROJECT_ID, "name": "Valid", "completionPercentage": 150},
                 models.CREATE_SPEC)
    assert "completionPercentage" in exc.value.field_errors


def test_status_enum_is_enforced():
    with pytest.raises(ValidationError) as exc:
        validate({"projectId": PROJECT_ID, "name": "Valid", "status": "nearly"}, models.CREATE_SPEC)
    assert "status" in exc.value.field_errors


def test_update_spec_cannot_move_a_deliverable_between_projects():
    """projectId is absent from UPDATE_SPEC, so it is silently ignored."""
    clean = validate({"projectId": OTHER_PROJECT_ID, "name": "Renamed"},
                     models.UPDATE_SPEC, partial=True)
    assert "projectId" not in clean


# --------------------------------------------------------------------------
# RBAC
# --------------------------------------------------------------------------


def test_stakeholder_can_read(monkeypatch):
    monkeypatch.setattr(service, "list_deliverables", lambda **kwargs: [ROW])
    assert routes.list_deliverables(make_event(role="STAKEHOLDER"))["statusCode"] == 200


def test_stakeholder_cannot_create():
    with pytest.raises(shared_auth.AuthError) as exc:
        routes.create_deliverable(make_event("POST", body={"name": "x"}, role="STAKEHOLDER"))
    assert exc.value.status == 403


def test_employee_cannot_delete():
    with pytest.raises(shared_auth.AuthError) as exc:
        routes.delete_deliverable(make_event("DELETE", role="EMPLOYEE"), id=DELIVERABLE_ID)
    assert exc.value.status == 403


def test_employee_can_update_assigned_status(monkeypatch):
    monkeypatch.setattr(service, "get_deliverable", lambda did: ROW)
    monkeypatch.setattr(service, "update_deliverable", lambda did, data: {**ROW, **{"status": "blocked"}})

    event = make_event("PATCH", body={"status": "blocked"}, role="EMPLOYEE")
    assert routes.update_status(event, id=DELIVERABLE_ID)["statusCode"] == 200


# --------------------------------------------------------------------------
# Reference checking
# --------------------------------------------------------------------------


def test_create_rejects_unknown_project(monkeypatch):
    monkeypatch.setattr(service, "project_exists", lambda pid: False)

    with pytest.raises(ValidationError) as exc:
        routes.create_deliverable(
            make_event("POST", body={"projectId": PROJECT_ID, "name": "Valid name"})
        )
    assert "projectId" in exc.value.field_errors


def test_create_rejects_unknown_assignee(monkeypatch):
    monkeypatch.setattr(service, "project_exists", lambda pid: True)
    monkeypatch.setattr(service, "resource_exists", lambda rid: False)

    with pytest.raises(ValidationError) as exc:
        routes.create_deliverable(
            make_event("POST", body={"projectId": PROJECT_ID, "name": "Valid name",
                                     "assigneeId": OTHER_ID})
        )
    assert "assigneeId" in exc.value.field_errors


def test_create_succeeds(monkeypatch):
    monkeypatch.setattr(service, "project_exists", lambda pid: True)
    monkeypatch.setattr(service, "create_deliverable", lambda data: ROW)

    result = routes.create_deliverable(
        make_event("POST", body={"projectId": PROJECT_ID, "name": "Design schema"})
    )
    assert result["statusCode"] == 201
    assert body_of(result)["name"] == "Design schema"


# --------------------------------------------------------------------------
# Dependencies — the cycle rules
# --------------------------------------------------------------------------


def test_cannot_depend_on_itself(monkeypatch):
    monkeypatch.setattr(service, "get_deliverable", lambda did: ROW)

    event = make_event("POST", body={"dependsOnId": DELIVERABLE_ID})
    with pytest.raises(ValidationError) as exc:
        routes.add_dependency(event, id=DELIVERABLE_ID)
    assert "dependsOnId" in exc.value.field_errors


def test_cannot_depend_across_projects(monkeypatch):
    """A chain spanning two projects means two schedules -- almost always a typo."""
    other = {**ROW, "id": OTHER_ID, "project_id": OTHER_PROJECT_ID}
    monkeypatch.setattr(
        service, "get_deliverable", lambda did: ROW if str(did) == DELIVERABLE_ID else other
    )

    event = make_event("POST", body={"dependsOnId": OTHER_ID})
    with pytest.raises(ValidationError) as exc:
        routes.add_dependency(event, id=DELIVERABLE_ID)
    # The specific text lives in field_errors, not in str(exception).
    assert "same project" in exc.value.field_errors["dependsOnId"]


def test_rejects_edge_that_would_close_a_cycle(monkeypatch):
    """The schema's CHECK stops A->A; A->B->C->A has to be caught here."""
    other = {**ROW, "id": OTHER_ID}
    monkeypatch.setattr(
        service, "get_deliverable", lambda did: ROW if str(did) == DELIVERABLE_ID else other
    )
    monkeypatch.setattr(service, "would_create_cycle", lambda a, b: True)

    event = make_event("POST", body={"dependsOnId": OTHER_ID})
    with pytest.raises(ValidationError) as exc:
        routes.add_dependency(event, id=DELIVERABLE_ID)
    assert "circular" in exc.value.field_errors["dependsOnId"]


def test_accepts_a_valid_dependency(monkeypatch):
    other = {**ROW, "id": OTHER_ID}
    monkeypatch.setattr(
        service, "get_deliverable", lambda did: ROW if str(did) == DELIVERABLE_ID else other
    )
    monkeypatch.setattr(service, "would_create_cycle", lambda a, b: False)
    monkeypatch.setattr(service, "add_dependency", lambda a, b: {"deliverable_id": a})

    event = make_event("POST", body={"dependsOnId": OTHER_ID})
    assert routes.add_dependency(event, id=DELIVERABLE_ID)["statusCode"] == 201


def test_dependency_on_missing_deliverable_is_rejected(monkeypatch):
    monkeypatch.setattr(
        service, "get_deliverable", lambda did: ROW if str(did) == DELIVERABLE_ID else None
    )

    event = make_event("POST", body={"dependsOnId": OTHER_ID})
    with pytest.raises(ValidationError) as exc:
        routes.add_dependency(event, id=DELIVERABLE_ID)
    assert "dependsOnId" in exc.value.field_errors


def test_chain_reports_what_is_blocking(monkeypatch):
    monkeypatch.setattr(service, "get_deliverable", lambda did: ROW)
    monkeypatch.setattr(
        service,
        "get_dependency_chain",
        lambda did: [
            {
                "depth": 1,
                "deliverable_id": DELIVERABLE_ID,
                "depends_on_id": OTHER_ID,
                "depends_on_name": "Provision database",
                "depends_on_status": "in_progress",
                "depends_on_due_date": date(2026, 2, 1),
                "depends_on_completion": 60,
            }
        ],
    )
    monkeypatch.setattr(
        service,
        "blocked_by_incomplete",
        lambda did: [
            {
                "id": OTHER_ID,
                "name": "Provision database",
                "status": "in_progress",
                "completion_percentage": 60,
                "due_date": date(2026, 2, 1),
            }
        ],
    )

    payload = body_of(routes.get_chain(make_event(), id=DELIVERABLE_ID))

    assert payload["chain"][0]["depth"] == 1
    assert payload["blockedBy"][0]["name"] == "Provision database"


# --------------------------------------------------------------------------
# Not found
# --------------------------------------------------------------------------


def test_get_missing_returns_404(monkeypatch):
    monkeypatch.setattr(service, "get_deliverable", lambda did: None)
    assert routes.get_deliverable(make_event(), id=DELIVERABLE_ID)["statusCode"] == 404


def test_update_missing_returns_404(monkeypatch):
    monkeypatch.setattr(service, "get_deliverable", lambda did: None)
    result = routes.update_deliverable(make_event("PUT", body={"name": "x"}), id=DELIVERABLE_ID)
    assert result["statusCode"] == 404


def test_delete_missing_returns_404(monkeypatch):
    monkeypatch.setattr(service, "delete_deliverable", lambda did: None)
    assert routes.delete_deliverable(make_event("DELETE"), id=DELIVERABLE_ID)["statusCode"] == 404


# --------------------------------------------------------------------------
# Serialisation
# --------------------------------------------------------------------------


def test_serialise_exposes_overdue_flag():
    assert models.serialise_deliverable({**ROW, "is_overdue": True})["isOverdue"] is True


def test_serialise_defaults_missing_dependency_array():
    bare = {k: v for k, v in ROW.items() if k != "depends_on"}
    assert models.serialise_deliverable(bare)["dependsOn"] == []
