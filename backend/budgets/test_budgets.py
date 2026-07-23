"""
Unit tests for the budgets service.

    cd backend/budgets && python -m pytest test_budgets.py -v
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
EXPENSE_ID = "77777777-7777-7777-7777-777777777777"

BUDGET = {
    "id": PROJECT_ID,
    "name": "Atlas Migration",
    "status": "active",
    "planned_budget": 100000,
    "budget_consumed": 40000,
    "expense_count": 3,
}

EXPENSE = {
    "id": EXPENSE_ID,
    "project_id": PROJECT_ID,
    "project_name": "Atlas Migration",
    "description": "Contractor invoice",
    "amount": 15000,
    "category": "labor",
    "incurred_on": date(2026, 2, 1),
}


def make_event(method="GET", path="/budgets", body=None, role="PROJECT_MANAGER", query=None):
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
# Consumed vs planned
# --------------------------------------------------------------------------


def test_variance_is_planned_minus_consumed():
    assert models.serialise_budget(BUDGET)["variance"] == 60000


def test_overspend_gives_negative_variance_and_flags():
    result = models.serialise_budget({**BUDGET, "budget_consumed": 150000})
    assert result["variance"] == -50000
    assert result["isOverspent"] is True


def test_consumed_ratio():
    assert models.serialise_budget(BUDGET)["consumedRatio"] == 0.4


def test_zero_planned_budget_gives_null_ratio_not_a_crash():
    """A project with no planned budget has no ratio -- not infinity, not 1/0."""
    result = models.serialise_budget({**BUDGET, "planned_budget": 0, "budget_consumed": 500})
    assert result["consumedRatio"] is None
    assert result["isOverspent"] is True


def test_spending_exactly_the_budget_is_not_overspent():
    result = models.serialise_budget({**BUDGET, "budget_consumed": 100000})
    assert result["isOverspent"] is False
    assert result["variance"] == 0


def test_no_expenses_yet():
    result = models.serialise_budget({**BUDGET, "budget_consumed": 0, "expense_count": 0})
    assert result["variance"] == 100000
    assert result["isOverspent"] is False


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------


def test_expense_requires_project_and_amount():
    with pytest.raises(ValidationError) as exc:
        validate({}, models.CREATE_SPEC)
    assert "projectId" in exc.value.field_errors
    assert "amount" in exc.value.field_errors


def test_negative_expense_is_rejected():
    with pytest.raises(ValidationError) as exc:
        validate({"projectId": PROJECT_ID, "amount": -100}, models.CREATE_SPEC)
    assert "amount" in exc.value.field_errors


def test_unknown_category_is_rejected():
    with pytest.raises(ValidationError) as exc:
        validate({"projectId": PROJECT_ID, "amount": 10, "category": "snacks"},
                 models.CREATE_SPEC)
    assert "category" in exc.value.field_errors


def test_amount_keeps_decimal_precision():
    """Via Decimal, so float noise never reaches a money column."""
    clean = validate({"projectId": PROJECT_ID, "amount": "1234.56"}, models.CREATE_SPEC)
    assert str(clean["amount"]) == "1234.56"


def test_expense_update_cannot_move_projects():
    clean = validate({"projectId": "other", "amount": 50}, models.UPDATE_SPEC, partial=True)
    assert "projectId" not in clean


def test_planned_budget_must_not_be_negative():
    with pytest.raises(ValidationError) as exc:
        validate({"plannedBudget": -1}, models.PLANNED_SPEC)
    assert "plannedBudget" in exc.value.field_errors


# --------------------------------------------------------------------------
# RBAC
# --------------------------------------------------------------------------


def test_stakeholder_can_read_budgets(monkeypatch):
    monkeypatch.setattr(service, "list_budgets", lambda **kwargs: [BUDGET])
    assert routes.list_budgets(make_event(role="STAKEHOLDER"))["statusCode"] == 200


def test_stakeholder_cannot_record_an_expense():
    with pytest.raises(shared_auth.AuthError) as exc:
        routes.create_expense(make_event("POST", body={}, role="STAKEHOLDER"))
    assert exc.value.status == 403


def test_employee_cannot_delete_an_expense():
    with pytest.raises(shared_auth.AuthError) as exc:
        routes.delete_expense(make_event("DELETE", role="TEAM_LEADER"), id=EXPENSE_ID)
    assert exc.value.status == 403


# --------------------------------------------------------------------------
# Recording spend
# --------------------------------------------------------------------------


def test_expense_that_tips_the_project_over_warns(monkeypatch):
    monkeypatch.setattr(service, "project_exists", lambda pid: True)
    monkeypatch.setattr(service, "create_expense", lambda data: EXPENSE)
    monkeypatch.setattr(service, "get_budget", lambda pid: {**BUDGET, "budget_consumed": 120000})

    payload = body_of(
        routes.create_expense(
            make_event("POST", body={"projectId": PROJECT_ID, "amount": 15000})
        )
    )
    assert payload["budgetWarning"]["variance"] == -20000


def test_expense_within_budget_has_no_warning(monkeypatch):
    monkeypatch.setattr(service, "project_exists", lambda pid: True)
    monkeypatch.setattr(service, "create_expense", lambda data: EXPENSE)
    monkeypatch.setattr(service, "get_budget", lambda pid: BUDGET)

    payload = body_of(
        routes.create_expense(
            make_event("POST", body={"projectId": PROJECT_ID, "amount": 15000})
        )
    )
    assert "budgetWarning" not in payload


def test_expense_rejects_unknown_project(monkeypatch):
    monkeypatch.setattr(service, "project_exists", lambda pid: False)

    with pytest.raises(ValidationError) as exc:
        routes.create_expense(make_event("POST", body={"projectId": PROJECT_ID, "amount": 100}))
    assert "projectId" in exc.value.field_errors


def test_budget_detail_includes_category_breakdown(monkeypatch):
    monkeypatch.setattr(service, "get_budget", lambda pid: BUDGET)
    monkeypatch.setattr(
        service, "get_breakdown",
        lambda pid: [{"category": "labor", "total": 30000, "line_count": 2}],
    )

    payload = body_of(routes.get_budget(make_event(), projectId=PROJECT_ID))
    assert payload["breakdown"][0]["category"] == "labor"


def test_list_rejects_invalid_category_filter():
    with pytest.raises(ValidationError) as exc:
        routes.list_expenses(make_event(query={"category": "snacks"}))
    assert "category" in exc.value.field_errors


# --------------------------------------------------------------------------
# Not found
# --------------------------------------------------------------------------


def test_missing_project_budget_returns_404(monkeypatch):
    monkeypatch.setattr(service, "get_budget", lambda pid: None)
    assert routes.get_budget(make_event(), projectId=PROJECT_ID)["statusCode"] == 404


def test_missing_expense_returns_404(monkeypatch):
    monkeypatch.setattr(service, "get_expense", lambda eid: None)
    assert routes.get_expense(make_event(), id=EXPENSE_ID)["statusCode"] == 404
