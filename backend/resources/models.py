"""
Validation specs and row serialisers for the resources service.

A "resource" is a person being tracked; an "allocation" commits a percentage of
that person's capacity to one project over a date range.
"""

CREATE_SPEC = {
    "fullName": {"type": "string", "required": True, "min_length": 2, "max_length": 150},
    "email": {"type": "email", "max_length": 255},
    "roleTitle": {"type": "string", "max_length": 100},
    # Mirrors the CHECK on resources.capacity_pct.
    "capacityPct": {"type": "integer", "min": 0, "max": 100},
}

UPDATE_SPEC = dict(CREATE_SPEC)

ALLOCATION_SPEC = {
    "resourceId": {"type": "uuid", "required": True},
    "projectId": {"type": "uuid", "required": True},
    "allocationPct": {"type": "integer", "required": True, "min": 1, "max": 100},
    "startDate": {"type": "date", "required": True},
    "endDate": {"type": "date"},
}

# resourceId and projectId are fixed after creation: changing either would
# silently rewrite two different projects' utilization history.
ALLOCATION_UPDATE_SPEC = {
    "allocationPct": {"type": "integer", "min": 1, "max": 100},
    "startDate": {"type": "date"},
    "endDate": {"type": "date"},
}


def check_date_order(clean, existing=None):
    """Cross-field rule: end must not precede start.

    On a partial update the missing side comes from the stored row, so moving
    only the start date past a stored end date is still caught.
    """
    start = clean.get("startDate", (existing or {}).get("start_date"))
    end = clean.get("endDate", (existing or {}).get("end_date"))

    if start and end and end < start:
        return {"endDate": "End date cannot be before the start date"}
    return {}


def serialise_resource(row):
    if row is None:
        return None

    return {
        "id": str(row["id"]),
        "fullName": row["full_name"],
        "email": row.get("email"),
        "roleTitle": row.get("role_title"),
        "capacityPct": row.get("capacity_pct", 100),
        # Present only on reads that join v_resource_utilization.
        "allocatedPct": row.get("allocated_pct", 0),
        "projectCount": row.get("project_count", 0),
        "isOverAllocated": row.get("is_over_allocated", False),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }


def serialise_allocation(row):
    if row is None:
        return None

    return {
        "id": str(row["id"]),
        "resourceId": str(row["resource_id"]),
        "resourceName": row.get("resource_name"),
        "projectId": str(row["project_id"]),
        "projectName": row.get("project_name"),
        "allocationPct": row["allocation_pct"],
        "startDate": row.get("start_date"),
        "endDate": row.get("end_date"),
        "isActive": row.get("is_active", False),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }
