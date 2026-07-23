"""
Validation specs and row serialisers for the deliverables service.
"""

DELIVERABLE_STATUSES = ("not_started", "in_progress", "blocked", "completed", "cancelled")

# Status values that mean the work is no longer outstanding. Used when counting
# overdue items -- a cancelled deliverable past its due date is not "late".
CLOSED_STATUSES = ("completed", "cancelled")

CREATE_SPEC = {
    "projectId": {"type": "uuid", "required": True},
    "name": {"type": "string", "required": True, "min_length": 3, "max_length": 200},
    "description": {"type": "string", "max_length": 5000},
    "status": {"type": "enum", "values": DELIVERABLE_STATUSES},
    "completionPercentage": {"type": "integer", "min": 0, "max": 100},
    "dueDate": {"type": "date"},
    "assigneeId": {"type": "uuid"},
}

# projectId is omitted: moving a deliverable between projects would orphan its
# dependency edges, which are only meaningful within one project's chain.
UPDATE_SPEC = {key: value for key, value in CREATE_SPEC.items() if key != "projectId"}

STATUS_SPEC = {
    "status": {"type": "enum", "required": True, "values": DELIVERABLE_STATUSES},
    "completionPercentage": {"type": "integer", "min": 0, "max": 100},
}

DEPENDENCY_SPEC = {
    "dependsOnId": {"type": "uuid", "required": True},
}


def reconcile_completion(clean):
    """Keeps status and completion_percentage from contradicting each other.

    The two columns can disagree -- 'completed' at 40%, or 100% while still
    'not_started' -- and a report averaging completion would then disagree with
    one counting statuses. Rather than rejecting the request, the obvious
    intent is applied:

      * status set to 'completed'  -> completion becomes 100
      * completion set to 100 with no status given -> status becomes 'completed'

    An explicit completion sent alongside 'completed' is left alone, so a
    caller can still record a partially-delivered item if they mean to.
    """
    result = dict(clean)

    if result.get("status") == "completed" and "completionPercentage" not in result:
        result["completionPercentage"] = 100
    elif result.get("completionPercentage") == 100 and "status" not in result:
        result["status"] = "completed"

    return result


def serialise_deliverable(row):
    """Maps a DB row to the JSON shape the frontend consumes."""
    if row is None:
        return None

    return {
        "id": str(row["id"]),
        "projectId": str(row["project_id"]),
        "projectName": row.get("project_name"),
        "name": row["name"],
        "description": row.get("description"),
        "status": row["status"],
        "completionPercentage": row.get("completion_percentage", 0),
        "dueDate": row.get("due_date"),
        "assigneeId": str(row["assignee_id"]) if row.get("assignee_id") else None,
        "assigneeName": row.get("assignee_name"),
        # Present only on reads that join the dependency table.
        "dependsOn": row.get("depends_on") or [],
        "isOverdue": row.get("is_overdue", False),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }
