"""
HTTP handlers for the deliverables service.
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


def _check_references(data):
    """Verifies FK targets up front so failures are 400s naming the field."""
    if data.get("projectId") and not service.project_exists(data["projectId"]):
        raise ValidationError({"projectId": "That project does not exist"})

    if data.get("assigneeId") and not service.resource_exists(data["assigneeId"]):
        raise ValidationError({"assigneeId": "That resource does not exist"})


def list_deliverables(event):
    """GET /deliverables — filterable, optionally scoped to one project."""
    claims = authenticate(event)
    require_permission(claims, "view_projects")

    params = event.get("queryStringParameters") or {}

    status = params.get("status")
    if status and status not in models.DELIVERABLE_STATUSES:
        raise ValidationError(
            {"status": f"Must be one of: {', '.join(models.DELIVERABLE_STATUSES)}"}
        )

    rows = service.list_deliverables(
        project_id=params.get("projectId"),
        status=status,
        assignee_id=params.get("assigneeId"),
        due_before=params.get("dueBefore"),
        overdue_only=_as_bool(params.get("overdueOnly")),
        search=params.get("search"),
    )
    return ok([models.serialise_deliverable(row) for row in rows])


def get_deliverable(event, id):
    """GET /deliverables/{id}"""
    claims = authenticate(event)
    require_permission(claims, "view_projects")

    row = service.get_deliverable(id)
    if not row:
        return not_found("Deliverable not found")

    return ok(models.serialise_deliverable(row))


def create_deliverable(event):
    """POST /deliverables"""
    claims = authenticate(event)
    require_permission(claims, "manage_deliverables")

    data = models.reconcile_completion(validate(parse_body(event), models.CREATE_SPEC))
    _check_references(data)

    row = service.create_deliverable(data)
    logger.info("Deliverable created: %s by %s", row["id"], claims["email"])
    return created(models.serialise_deliverable(row))


def update_deliverable(event, id):
    """PUT /deliverables/{id} — partial update."""
    claims = authenticate(event)
    require_permission(claims, "update_deliverables")

    if not service.get_deliverable(id):
        return not_found("Deliverable not found")

    data = models.reconcile_completion(
        validate(parse_body(event), models.UPDATE_SPEC, partial=True)
    )
    _check_references(data)

    row = service.update_deliverable(id, data)
    logger.info("Deliverable updated: %s by %s", id, claims["email"])
    return ok(models.serialise_deliverable(row))


def update_status(event, id):
    """PATCH /deliverables/{id}/status — status-only transition.

    Separate from the full update so a board or table can move an item without
    round-tripping every other field.
    """
    claims = authenticate(event)
    require_permission(claims, "update_deliverables")

    if not service.get_deliverable(id):
        return not_found("Deliverable not found")

    data = models.reconcile_completion(validate(parse_body(event), models.STATUS_SPEC))

    row = service.update_deliverable(id, data)
    return ok(models.serialise_deliverable(row))


def delete_deliverable(event, id):
    """DELETE /deliverables/{id} — Admin and Manager only."""
    claims = authenticate(event)
    require_permission(claims, "manage_deliverables")

    deleted = service.delete_deliverable(id)
    if not deleted:
        return not_found("Deliverable not found")

    logger.info("Deliverable deleted: %s by %s", id, claims["email"])
    return no_content()


# -- Dependencies -----------------------------------------------------------


def get_chain(event, id):
    """GET /deliverables/{id}/chain — the prerequisite chain, depth-annotated."""
    claims = authenticate(event)
    require_permission(claims, "view_projects")

    deliverable = service.get_deliverable(id)
    if not deliverable:
        return not_found("Deliverable not found")

    rows = service.get_dependency_chain(id)
    blocking = service.blocked_by_incomplete(id)

    return ok(
        {
            "deliverable": models.serialise_deliverable(deliverable),
            "chain": [
                {
                    "depth": row["depth"],
                    "id": str(row["depends_on_id"]),
                    "name": row["depends_on_name"],
                    "status": row["depends_on_status"],
                    "dueDate": row["depends_on_due_date"],
                    "completionPercentage": row["depends_on_completion"],
                }
                for row in rows
            ],
            # Non-empty means this deliverable cannot start yet -- the direct
            # answer to "identify bottlenecks".
            "blockedBy": [
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "status": row["status"],
                    "completionPercentage": row["completion_percentage"],
                    "dueDate": row["due_date"],
                }
                for row in blocking
            ],
        }
    )


def add_dependency(event, id):
    """POST /deliverables/{id}/dependencies

    Rejects an edge that would close a cycle. The schema's CHECK only prevents
    A->A; A->B->C->A has to be caught here.
    """
    claims = authenticate(event)
    require_permission(claims, "manage_deliverables")

    deliverable = service.get_deliverable(id)
    if not deliverable:
        return not_found("Deliverable not found")

    data = validate(parse_body(event), models.DEPENDENCY_SPEC)
    depends_on_id = data["dependsOnId"]

    if str(depends_on_id) == str(id):
        raise ValidationError({"dependsOnId": "A deliverable cannot depend on itself"})

    target = service.get_deliverable(depends_on_id)
    if not target:
        raise ValidationError({"dependsOnId": "That deliverable does not exist"})

    # A dependency across projects would make the chain span two schedules and
    # is almost always a mistake in data entry.
    if str(target["project_id"]) != str(deliverable["project_id"]):
        raise ValidationError(
            {"dependsOnId": "Both deliverables must belong to the same project"}
        )

    if service.would_create_cycle(id, depends_on_id):
        raise ValidationError(
            {"dependsOnId": "That would create a circular dependency"}
        )

    service.add_dependency(id, depends_on_id)
    return created(models.serialise_deliverable(service.get_deliverable(id)))


def remove_dependency(event, id, dependsOnId):
    """DELETE /deliverables/{id}/dependencies/{dependsOnId}"""
    claims = authenticate(event)
    require_permission(claims, "manage_deliverables")

    removed = service.remove_dependency(id, dependsOnId)
    if not removed:
        return not_found("That dependency does not exist")

    return no_content()


def get_project_graph(event, projectId):
    """GET /projects/{projectId}/graph — nodes and edges for one project."""
    claims = authenticate(event)
    require_permission(claims, "view_projects")

    nodes, edges = service.get_project_graph(projectId)

    return ok(
        {
            "nodes": [
                {
                    "id": str(node["id"]),
                    "name": node["name"],
                    "status": node["status"],
                    "dueDate": node["due_date"],
                    "completionPercentage": node["completion_percentage"],
                    "isOverdue": node["is_overdue"],
                }
                for node in nodes
            ],
            "edges": [
                {"from": str(edge["deliverable_id"]), "dependsOn": str(edge["depends_on_id"])}
                for edge in edges
            ],
        }
    )
