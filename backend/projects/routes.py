"""
HTTP handlers for the projects service.

Shape of every mutating handler: authenticate -> check permission -> validate
-> verify references -> act. Doing authorization before validation means an
unauthorised caller learns nothing about which fields are valid.
"""

import logging

import models
import service
from _shared.auth import authenticate, require_permission
from _shared.responses import created, no_content, not_found, ok
from _shared.validation import ValidationError, parse_body, validate

logger = logging.getLogger()


def _as_bool(value):
    """Parses a query-string flag; None when absent or unrecognised."""
    if value is None:
        return None
    return str(value).lower() in ("true", "1", "yes")


def list_projects(event):
    """GET /projects — filterable list, health figures included."""
    claims = authenticate(event)
    require_permission(claims, "view_projects")

    params = event.get("queryStringParameters") or {}

    status = params.get("status")
    if status and status not in models.PROJECT_STATUSES:
        raise ValidationError({"status": f"Must be one of: {', '.join(models.PROJECT_STATUSES)}"})

    rows = service.list_projects(
        search=params.get("search"),
        status=status,
        department=params.get("department"),
        owner_id=params.get("ownerId"),
        at_risk=_as_bool(params.get("atRisk")),
    )
    return ok([models.serialise_project(row) for row in rows])


def get_project(event, id):
    """GET /projects/{id}"""
    claims = authenticate(event)
    require_permission(claims, "view_projects")

    project = service.get_project(id)
    if not project:
        return not_found("Project not found")

    return ok(models.serialise_project(project))


def get_summary(event, id):
    """GET /projects/{id}/summary — deliverable counts and budget roll-up."""
    claims = authenticate(event)
    require_permission(claims, "view_projects")

    summary = service.get_summary(id)
    if not summary:
        return not_found("Project not found")

    return ok(
        {
            "id": str(summary["id"]),
            "name": summary["name"],
            "plannedBudget": summary["planned_budget"],
            "budgetConsumed": summary["budget_consumed"],
            "avgCompletion": summary["avg_completion"],
            "atRisk": summary["at_risk"],
            "totalDeliverables": summary["total_deliverables"],
            "completedDeliverables": summary["completed_deliverables"],
            "blockedDeliverables": summary["blocked_deliverables"],
            "overdueDeliverables": summary["overdue_deliverables"],
        }
    )


def create_project(event):
    """POST /projects — Admin, Manager or Contributor."""
    claims = authenticate(event)
    require_permission(claims, "create_projects")

    data = validate(parse_body(event), models.CREATE_SPEC)

    errors = models.check_date_order(data)
    if errors:
        raise ValidationError(errors)

    # Verified up front so an unknown manager is a 400 naming ownerId, rather
    # than a foreign-key violation surfacing as a 409.
    if data.get("ownerId") and not service.owner_exists(data["ownerId"]):
        raise ValidationError({"ownerId": "That user does not exist"})

    project = service.create_project(data)
    logger.info("Project created: %s by %s", project["id"], claims["email"])
    return created(models.serialise_project(project))


def update_project(event, id):
    """PUT /projects/{id} — partial update; absent fields are left alone."""
    claims = authenticate(event)
    require_permission(claims, "edit_projects")

    existing = service.get_project(id)
    if not existing:
        return not_found("Project not found")

    data = validate(parse_body(event), models.UPDATE_SPEC, partial=True)

    # The stored row supplies whichever date the request omitted.
    errors = models.check_date_order(data, existing)
    if errors:
        raise ValidationError(errors)

    if data.get("ownerId") and not service.owner_exists(data["ownerId"]):
        raise ValidationError({"ownerId": "That user does not exist"})

    updated = service.update_project(id, data)
    logger.info("Project updated: %s by %s", id, claims["email"])
    return ok(models.serialise_project(updated))


def delete_project(event, id):
    """DELETE /projects/{id} — Admin and Manager only.

    Deliverables, allocations and expenses cascade (see schema.sql), so this
    removes a whole subtree. Contributors are excluded for exactly that reason.
    """
    claims = authenticate(event)
    require_permission(claims, "delete_projects")

    deleted = service.delete_project(id)
    if not deleted:
        return not_found("Project not found")

    logger.info("Project deleted: %s by %s", id, claims["email"])
    return no_content()
