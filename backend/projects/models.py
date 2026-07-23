"""
Validation specs and row serialisers for the projects service.

The status values mirror the CHECK constraint in schema.sql. Declaring them
here as well is deliberate: it turns a database-level rejection (a 500-shaped
error with a constraint name) into a 400 with a message naming the valid
options.
"""

PROJECT_STATUSES = ("planning", "active", "on_hold", "completed", "cancelled")

CREATE_SPEC = {
    "name": {"type": "string", "required": True, "min_length": 3, "max_length": 200},
    "description": {"type": "string", "max_length": 5000},
    "department": {"type": "string", "max_length": 100},
    "status": {"type": "enum", "values": PROJECT_STATUSES},
    "startDate": {"type": "date"},
    "endDate": {"type": "date"},
    "plannedBudget": {"type": "decimal", "min": 0},
    "ownerId": {"type": "uuid"},
}

# Same rules, all optional -- `partial=True` at the call site handles the
# difference, so there is no second copy of the constraints to keep in step.
UPDATE_SPEC = dict(CREATE_SPEC)


def check_date_order(clean, existing=None):
    """Cross-field rule the per-field specs cannot express.

    On a partial update only one of the two dates may be present, so the
    missing side is taken from the stored row -- otherwise moving a start date
    past a stored end date would slip through.

    Returns:
        dict of field errors, empty when the dates are consistent.
    """
    start = clean.get("startDate", (existing or {}).get("start_date"))
    end = clean.get("endDate", (existing or {}).get("end_date"))

    if start and end and end < start:
        return {"endDate": "End date cannot be before the start date"}
    return {}


def serialise_project(row):
    """Maps a DB row to the JSON shape the frontend consumes.

    The health columns (avg_completion, budget_consumed, at_risk) come from the
    v_project_health view and are absent on a plain row, so each is defaulted
    rather than assumed.
    """
    if row is None:
        return None

    return {
        "id": str(row["id"]),
        "name": row["name"],
        "description": row.get("description"),
        "department": row.get("department"),
        "status": row["status"],
        "startDate": row.get("start_date"),
        "endDate": row.get("end_date"),
        "plannedBudget": row.get("planned_budget"),
        "ownerId": str(row["owner_id"]) if row.get("owner_id") else None,
        "ownerName": row.get("owner_name"),
        "budgetConsumed": row.get("budget_consumed", 0),
        "avgCompletion": row.get("avg_completion"),
        "deliverableCount": row.get("deliverable_count", 0),
        "overdueCount": row.get("overdue_count", 0),
        "atRisk": row.get("at_risk", False),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }
