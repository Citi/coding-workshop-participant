"""
HTTP handlers for the budgets service.
"""

import logging

import models
import service
from _shared.auth import authenticate, require_permission
from _shared.responses import created, no_content, not_found, ok
from _shared.validation import ValidationError, parse_body, validate

logger = logging.getLogger()


def _as_bool(value):
    if value is None:
        return None
    return str(value).lower() in ("true", "1", "yes")


# -- Budgets ----------------------------------------------------------------


def list_budgets(event):
    """GET /budgets — consumed vs planned for every project."""
    claims = authenticate(event)
    require_permission(claims, "view_budgets")

    params = event.get("queryStringParameters") or {}

    rows = service.list_budgets(
        project_id=params.get("projectId"),
        status=params.get("status"),
        overspent_only=_as_bool(params.get("overspentOnly")),
    )
    return ok([models.serialise_budget(row) for row in rows])


def get_budget(event, projectId):
    """GET /budgets/{projectId} — one project's budget, split by category."""
    claims = authenticate(event)
    require_permission(claims, "view_budgets")

    row = service.get_budget(projectId)
    if not row:
        return not_found("Project not found")

    result = models.serialise_budget(row)
    result["breakdown"] = [
        {
            "category": entry["category"],
            "total": entry["total"],
            "lineCount": entry["line_count"],
        }
        for entry in service.get_breakdown(projectId)
    ]
    return ok(result)


def update_planned(event, projectId):
    """PUT /budgets/{projectId} — set the planned figure on the project."""
    claims = authenticate(event)
    require_permission(claims, "manage_budgets")

    if not service.project_exists(projectId):
        return not_found("Project not found")

    data = validate(parse_body(event), models.PLANNED_SPEC)

    row = service.update_planned_budget(projectId, data["plannedBudget"])
    logger.info("Planned budget updated for %s by %s", projectId, claims["email"])
    return ok(models.serialise_budget(row))


# -- Expenses ---------------------------------------------------------------


def list_expenses(event):
    """GET /expenses — filter by projectId, category or date range."""
    claims = authenticate(event)
    require_permission(claims, "view_budgets")

    params = event.get("queryStringParameters") or {}

    category = params.get("category")
    if category and category not in models.EXPENSE_CATEGORIES:
        raise ValidationError(
            {"category": f"Must be one of: {', '.join(models.EXPENSE_CATEGORIES)}"}
        )

    rows = service.list_expenses(
        project_id=params.get("projectId"),
        category=category,
        since=params.get("since"),
        until=params.get("until"),
    )
    return ok([models.serialise_expense(row) for row in rows])


def get_expense(event, id):
    """GET /expenses/{id}"""
    claims = authenticate(event)
    require_permission(claims, "view_budgets")

    row = service.get_expense(id)
    if not row:
        return not_found("Expense not found")

    return ok(models.serialise_expense(row))


def create_expense(event):
    """POST /expenses — records spend against a project."""
    claims = authenticate(event)
    require_permission(claims, "manage_budgets")

    data = validate(parse_body(event), models.CREATE_SPEC)

    if not service.project_exists(data["projectId"]):
        raise ValidationError({"projectId": "That project does not exist"})

    row = service.create_expense(data)
    result = models.serialise_expense(row)

    # Surface the consequence immediately: recording spend that tips a project
    # over budget is exactly the moment a manager needs to know.
    budget = service.get_budget(data["projectId"])
    summary = models.serialise_budget(budget)
    if summary["isOverspent"]:
        result["budgetWarning"] = {
            "plannedBudget": summary["plannedBudget"],
            "budgetConsumed": summary["budgetConsumed"],
            "variance": summary["variance"],
            "message": f"{summary['projectName']} is now over its planned budget",
        }
        logger.warning("Project %s is over budget", summary["projectName"])

    return created(result)


def update_expense(event, id):
    """PUT /expenses/{id} — partial update; the project cannot be changed."""
    claims = authenticate(event)
    require_permission(claims, "manage_budgets")

    if not service.get_expense(id):
        return not_found("Expense not found")

    data = validate(parse_body(event), models.UPDATE_SPEC, partial=True)

    row = service.update_expense(id, data)
    return ok(models.serialise_expense(row))


def delete_expense(event, id):
    """DELETE /expenses/{id} — Admin and Manager only."""
    claims = authenticate(event)
    require_permission(claims, "manage_budgets")

    deleted = service.delete_expense(id)
    if not deleted:
        return not_found("Expense not found")

    logger.info("Expense deleted: %s by %s", id, claims["email"])
    return no_content()
