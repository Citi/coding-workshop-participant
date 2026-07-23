"""
HTTP handlers for the resources service.
"""

import logging

import models
import service
from _shared.auth import authenticate, require_permission
from _shared.responses import created, no_content, not_found, ok, response
from _shared.validation import ValidationError, parse_body, validate

logger = logging.getLogger()


def _as_bool(value):
    if value is None:
        return None
    return str(value).lower() in ("true", "1", "yes")


# -- Resources --------------------------------------------------------------


def list_resources(event):
    """GET /resources — filterable, utilization figures included."""
    claims = authenticate(event)
    require_permission(claims, "view_allocation")

    params = event.get("queryStringParameters") or {}

    rows = service.list_resources(
        search=params.get("search"),
        role_title=params.get("roleTitle"),
        over_allocated=_as_bool(params.get("overAllocated")),
        available_only=_as_bool(params.get("availableOnly")),
    )
    return ok([models.serialise_resource(row) for row in rows])


def get_resource(event, id):
    """GET /resources/{id} — the person, plus the projects they are on."""
    claims = authenticate(event)
    require_permission(claims, "view_allocation")

    row = service.get_resource(id)
    if not row:
        return not_found("Resource not found")

    result = models.serialise_resource(row)
    result["projects"] = [
        {
            "id": str(project["id"]),
            "name": project["name"],
            "status": project["status"],
            "allocationPct": project["allocation_pct"],
            "startDate": project["start_date"],
            "endDate": project["end_date"],
        }
        for project in service.get_resource_projects(id)
    ]
    return ok(result)


def create_resource(event):
    """POST /resources"""
    claims = authenticate(event)
    require_permission(claims, "assign_employees")

    data = validate(parse_body(event), models.CREATE_SPEC)

    row = service.create_resource(data)
    logger.info("Resource created: %s by %s", row["id"], claims["email"])
    return created(models.serialise_resource(row))


def update_resource(event, id):
    """PUT /resources/{id} — partial update."""
    claims = authenticate(event)
    require_permission(claims, "assign_employees")

    if not service.get_resource(id):
        return not_found("Resource not found")

    data = validate(parse_body(event), models.UPDATE_SPEC, partial=True)

    row = service.update_resource(id, data)
    return ok(models.serialise_resource(row))


def delete_resource(event, id):
    """DELETE /resources/{id} — Admin and Manager only; allocations cascade."""
    claims = authenticate(event)
    require_permission(claims, "assign_employees")

    deleted = service.delete_resource(id)
    if not deleted:
        return not_found("Resource not found")

    logger.info("Resource deleted: %s by %s", id, claims["email"])
    return no_content()


def get_utilization(event):
    """GET /resources/utilization — who is over-allocated, and by how much."""
    claims = authenticate(event)
    require_permission(claims, "view_allocation")

    rows = service.get_utilization()
    return ok(
        [
            {
                "resourceId": str(row["id"]),
                "fullName": row["full_name"],
                "roleTitle": row["role_title"],
                "capacityPct": row["capacity_pct"],
                "allocatedPct": row["allocated_pct"],
                "projectCount": row["project_count"],
                "isOverAllocated": row["is_over_allocated"],
            }
            for row in rows
        ]
    )


# -- Allocations ------------------------------------------------------------


def list_allocations(event):
    """GET /allocations — filter by resourceId, projectId or activeOnly."""
    claims = authenticate(event)
    require_permission(claims, "view_allocation")

    params = event.get("queryStringParameters") or {}

    rows = service.list_allocations(
        resource_id=params.get("resourceId"),
        project_id=params.get("projectId"),
        active_only=_as_bool(params.get("activeOnly")),
    )
    return ok([models.serialise_allocation(row) for row in rows])


def list_resource_allocations(event, id):
    """GET /resources/{id}/allocations"""
    claims = authenticate(event)
    require_permission(claims, "view_allocation")

    if not service.get_resource(id):
        return not_found("Resource not found")

    rows = service.list_allocations(resource_id=id)
    return ok([models.serialise_allocation(row) for row in rows])


def create_allocation(event):
    """POST /allocations

    Returns 201 with an `overAllocation` block when the commitment pushes the
    person past their capacity. The write still succeeds -- see
    service.committed_in_window for why this warns rather than blocks.
    """
    claims = authenticate(event)
    require_permission(claims, "assign_employees")

    data = validate(parse_body(event), models.ALLOCATION_SPEC)

    errors = models.check_date_order(data)
    if errors:
        raise ValidationError(errors)

    resource = service.get_resource(data["resourceId"])
    if not resource:
        raise ValidationError({"resourceId": "That resource does not exist"})

    if not service.project_exists(data["projectId"]):
        raise ValidationError({"projectId": "That project does not exist"})

    committed = service.committed_in_window(
        data["resourceId"], data["startDate"], data.get("endDate")
    )
    projected = committed + data["allocationPct"]

    row = service.create_allocation(data)
    result = models.serialise_allocation(row)

    if projected > resource["capacity_pct"]:
        result["overAllocation"] = {
            "capacityPct": resource["capacity_pct"],
            "committedElsewhere": committed,
            "projectedTotal": projected,
            "message": (
                f"{resource['full_name']} is now allocated {projected}% over an "
                f"overlapping period, above their {resource['capacity_pct']}% capacity"
            ),
        }
        logger.warning("Over-allocation: %s at %s%%", resource["full_name"], projected)

    return created(result)


def update_allocation(event, id):
    """PUT /allocations/{id} — percentage and dates only."""
    claims = authenticate(event)
    require_permission(claims, "assign_employees")

    existing = service.get_allocation(id)
    if not existing:
        return not_found("Allocation not found")

    data = validate(parse_body(event), models.ALLOCATION_UPDATE_SPEC, partial=True)

    errors = models.check_date_order(data, existing)
    if errors:
        raise ValidationError(errors)

    row = service.update_allocation(id, data)
    return ok(models.serialise_allocation(row))


def delete_allocation(event, id):
    """DELETE /allocations/{id}"""
    claims = authenticate(event)
    require_permission(claims, "assign_employees")

    deleted = service.delete_allocation(id)
    if not deleted:
        return not_found("Allocation not found")

    return no_content()
