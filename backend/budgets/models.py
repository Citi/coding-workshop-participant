"""
Validation specs and row serialisers for the budgets service.

The planned figure lives on projects.planned_budget; actuals are individual
line items in `expenses`. "Consumed vs planned" is therefore an aggregate over
expenses compared against the project's own column -- there is no separate
budget record to drift out of sync.
"""

EXPENSE_CATEGORIES = ("labor", "tooling", "travel", "licensing", "hardware", "other")

CREATE_SPEC = {
    "projectId": {"type": "uuid", "required": True},
    "description": {"type": "string", "max_length": 255},
    "amount": {"type": "decimal", "required": True, "min": 0},
    "category": {"type": "enum", "values": EXPENSE_CATEGORIES},
    "incurredOn": {"type": "date"},
}

# projectId is fixed after creation: moving an expense would silently rewrite
# two projects' consumption figures.
UPDATE_SPEC = {key: value for key, value in CREATE_SPEC.items() if key != "projectId"}

# Editing the planned side is a project-level change, exposed here so budget
# management is one workflow rather than two.
PLANNED_SPEC = {
    "plannedBudget": {"type": "decimal", "required": True, "min": 0},
}


def serialise_expense(row):
    if row is None:
        return None

    return {
        "id": str(row["id"]),
        "projectId": str(row["project_id"]),
        "projectName": row.get("project_name"),
        "description": row.get("description"),
        "amount": row["amount"],
        "category": row.get("category"),
        "incurredOn": row.get("incurred_on"),
        "createdAt": row.get("created_at"),
    }


def serialise_budget(row):
    """The consumed-vs-planned view of one project.

    `variance` is planned minus consumed: negative means overspent. It is
    computed here rather than in SQL so the sign convention is stated in one
    place instead of being re-derived by every caller.
    """
    if row is None:
        return None

    planned = float(row.get("planned_budget") or 0)
    consumed = float(row.get("budget_consumed") or 0)

    return {
        "projectId": str(row["id"]),
        "projectName": row["name"],
        "status": row.get("status"),
        "plannedBudget": row.get("planned_budget"),
        "budgetConsumed": row.get("budget_consumed", 0),
        "variance": planned - consumed,
        # Guard the division: a project with no planned budget is not "infinitely
        # overspent", it simply has no ratio to report.
        "consumedRatio": round(consumed / planned, 4) if planned > 0 else None,
        "isOverspent": consumed > planned,
        "expenseCount": row.get("expense_count", 0),
    }
